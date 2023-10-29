import os = require('os');
import fs = require('fs');
import path = require('path');
import tl = require('azure-pipelines-task-lib/task');
import tr = require("azure-pipelines-task-lib/toolrunner");
import gitTool = require('./utils');

async function run() {
    try {
        const isDebug:boolean = Boolean(tl.getVariable("System.Debug"));
        const isPullRequest = tl.getVariable("Build.Reason")! == "PullRequest";
        const localWorkingPath = tl.getVariable("Build.Repository.LocalPath")!;
        
        // Get the tools 
        const useGlobalToolOption = tl.getBoolInput("workspaceAsFolderOption");
        let toolRunOptions: tr.IExecOptions = {
            cwd: localWorkingPath
        };

        let toolPath: string;
        let tool:tr.ToolRunner;
        if(useGlobalToolOption){
            toolPath = tl.which("dotnet-format", true);
            tool = tl.tool(toolPath);
        } else{
            toolPath = tl.which("dotnet", true);
            tool = tl
                .tool(toolPath)
                .arg("format");
        }
        
        if(isDebug){
            await tool
                .arg("--version")
                .execAsync();
        }

        /// (TS) Tools setup
        // TS:workspace
        const workspaceOption = tl.getPathInput("workspaceOption", true)!;
        const workspaceAsFolderOption = tl.getBoolInput("workspaceAsFolderOption");
        const onlyChangedFiles = tl.getBoolInput("onlyChangedFiles");        
        
        if(workspaceOption == "" && onlyChangedFiles){
            if(!isPullRequest){
                console.error("`Build.Reason` != PullRequest, can't get the diff.")
                tl.setResult(tl.TaskResult.Failed, "Can't find diff. between target and source branch, for PullRequest"); //TODO: better log
                return;
            }

            const pullRequestTargetBranch = tl.getVariable("System.PullRequest.TargetBranch")!;
            //TODO detect SCM
            let gitScm = new gitTool.GitToolRunner();
            const changeSet = gitScm.getChangeFor(pullRequestTargetBranch, '*.cs');
            const rspFilePath = path.join(localWorkingPath, "FilesToCheck.rsp");
            fs.writeFile(rspFilePath, changeSet.join(os.EOL), function (err) {
                if (err) {
                    return console.error(err);
                }
                console.debug(`FilesToCheck.rsp writen with ${changeSet.length} files`);
            });
            tool = tool.arg(['--include', '@FilesToCheck.rsp']);
        } else {
            if(workspaceAsFolderOption){
                tool = tool.arg(["-f", workspaceOption]);
            } else {
                tool = tool.arg(workspaceOption);
            }            
        }       

        // TS:command
        const commandToRun = tl.getInput("command", true);
        switch (commandToRun) {
            case "check":
                tool = tool
                    .arg("--check");
                break;
            case "custom":
                tl.setResult(tl.TaskResult.Failed, "Custom command isn't impl. yet!");
                return;
            default:
                tl.setResult(tl.TaskResult.Failed, "No command selected");
                return;
        }      
        // TS:advanced options
        const noRestoreOption = tl.getBoolInput("noRestoreOption", false);
        if(noRestoreOption){
            tool = tool
                .arg("--no-restore");
        }      

        const fixWhitespaceOption = tl.getBoolInput("fixWhitespaceOption", false);
        if(fixWhitespaceOption){
            tool = tool
                .arg(['--fix-whitespace']);
        }

        const fixStyleOption = tl.getInput("fixStyleOption", false);
        if(fixStyleOption && fixStyleOption != "-"){
            tool = tool
                .arg(['--fix-style', fixStyleOption.toLowerCase()]);
        }

        const fixAnalyzersOption = tl.getInput("fixAnalyzersOption", false);
        if(fixAnalyzersOption && fixAnalyzersOption != "-"){
            tool = tool
                .arg(['--fix-analyzers', fixAnalyzersOption.toLowerCase()]);
        }

        const diagnosticsOption = tl.getDelimitedInput("diagnosticsOption", ",");
        if((fixStyleOption || fixAnalyzersOption) && diagnosticsOption.length){
            tool = tool
                .arg(['--diagnostics', diagnosticsOption.join(" ")]);
        }

        const verbosityOption = tl.getInput("verbosityOption", false);
        if(verbosityOption){
            tool = tool
                .arg(['--verbosity', verbosityOption.toLowerCase()]);
        }

        var runReturnCode: number = await tool.execAsync(toolRunOptions);
        console.log(runReturnCode);
    }
    catch (error: any) {
        tl.setResult(tl.TaskResult.Failed, error.message);
    }
}
run();