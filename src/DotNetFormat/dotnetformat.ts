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
        const useGlobalToolOption = tl.getBoolInput("useGlobalToolOption");
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

        // command
        const commandToRun = tl.getInput("command", true);
        if(commandToRun === "custom"){
            tl.setResult(tl.TaskResult.Failed, "Custom command isn't impl. yet!");
            return;
        }

        const workspaceOption = tl.getPathInput("workspaceOption", true)!;
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
            tool = tool.arg(workspaceOption);          
        }       
  
        // advanced options
        const noRestoreOption = tl.getBoolInput("noRestoreOption", false);
        if(noRestoreOption){
            tool = tool
                .arg("--no-restore");
        }
        
        const includeGeneratedOption = tl.getBoolInput("includeGeneratedOption", false);
        if(includeGeneratedOption){
            tool = tool
                .arg("--include-generated");
        }     
    
        const diagnosticsOption = tl.getDelimitedInput("diagnosticsOption", ",");
        if(diagnosticsOption.length){
            tool = tool
                .arg(['--diagnostics', diagnosticsOption.join(" ")]);
        }

        const excludedDiagnosticsOption = tl.getDelimitedInput("diagnosticsExcludedOption", ",");
        if(excludedDiagnosticsOption.length){
            tool = tool
                .arg(['--exclude-diagnostics', excludedDiagnosticsOption.join(" ")]);
        }

        const verbosityOption = tl.getInput("verbosityOption", false);
        if(verbosityOption){
            tool = tool
                .arg(['--verbosity', verbosityOption.toLowerCase()]);
        }
        
        const runReturnCode = await tool
            .argIf(isDebug == true, `--binarylog ${tl.getVariable("Build.ArtifactStagingDirectory")}/Logs/format.binlog`)
            .execAsync(toolRunOptions);
        console.log(runReturnCode);
    }
    catch (error: any) {
        tl.setResult(tl.TaskResult.Failed, error.message);
    }
}
run();