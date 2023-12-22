import os = require('os');
import path = require('node:path');
import tl = require('azure-pipelines-task-lib/task');
import tr = require("azure-pipelines-task-lib/toolrunner");
import gitTool = require('./utils');

async function run() {
    try {
        const isDebug = tl.getVariable("System.Debug") == 'True';
        const isPullRequest = tl.getVariable("Build.Reason")! == "PullRequest";
        const localWorkingPath = tl.getVariable("Build.Repository.LocalPath")!;
        
        // Get the tools 
        const workingDirectoryOption = tl.getPathInput("workingDirectoryOption");
        let toolRunOptions: tr.IExecOptions = {
            cwd: workingDirectoryOption == null ? localWorkingPath : workingDirectoryOption 
        };

        const useGlobalToolOption = tl.getBoolInput("useGlobalToolOption");
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
            await tl
                .tool(toolPath)
                .line("format --version")
                .execAsync(toolRunOptions);
        }

        // command
        const commandToRun = tl.getInput("command", true);
        if(commandToRun === "custom"){
            tl.setResult(tl.TaskResult.Failed, "Custom command isn't impl. yet!");
            return;
        } else if(commandToRun === "fix"){
            tl.setResult(tl.TaskResult.Failed, "Fix command isn't impl. yet!");
            return;
        }

        const workspaceOption = tl.getPathInput("workspaceOption")!;
        const onlyChangedFiles = tl.getBoolInput("onlyChangedFiles");      

        if(onlyChangedFiles){
            if(!isPullRequest){
                console.error("`Build.Reason` != PullRequest, can't get the diff.")
                tl.setResult(tl.TaskResult.Failed, "Can't find diff. between target and source branch, for PullRequest"); //TODO: better log
                return;
            }

            const pullRequestTargetBranch = tl.getVariable("System.PullRequest.TargetBranch")!;
            //TODO detect SCM
            let gitScm = new gitTool.GitToolRunner();
            const changeSet = await gitScm.getChangeFor(pullRequestTargetBranch, '*.cs');
            const rspFilePath = path.join(localWorkingPath, "FilesToCheck.rsp");
            tl.writeFile(rspFilePath, changeSet.join(os.EOL));

            tool = tool
                .arg(workspaceOption)
                .arg(['--include', `@${rspFilePath}`]);
        } else {
            tool = tool.arg(workspaceOption);
            
            const includeOptions = tl.getDelimitedInput("includeOptions", os.EOL);
            if(includeOptions.length){
                const includedRspFilePath = path.normalize(path.join(localWorkingPath, "Included.rsp"));
                tl.writeFile(includedRspFilePath, includeOptions.join(os.EOL));
                console.debug(`Include file ${includedRspFilePath} with ${includeOptions.length}`);
                tool = tool
                    .arg(['--include', `@${includedRspFilePath}`]);
            }            
        }

        const excludeOptions = tl.getDelimitedInput("excludeOptions", os.EOL);
        if(excludeOptions.length){
            const excludedRspFilePath = path.normalize(path.join(localWorkingPath, "Excluded.rsp"));
            tl.writeFile(excludedRspFilePath, excludeOptions.join(os.EOL));
            console.debug(`Include file ${excludedRspFilePath} with ${excludeOptions.length}`);
            tool = tool
                .arg(['--exclude', `@${excludedRspFilePath}`]);
        }

        const severityOption = tl.getInput("severityOption", false);
        if(severityOption){
            tool = tool
                .arg(['--severity', `${severityOption}`]);
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
    
        const diagnosticsOptions = tl.getDelimitedInput("diagnosticsOptions", ",");
        if(diagnosticsOptions.length){
            tool = tool
                .arg(['--diagnostics', `${diagnosticsOptions.join(" ")}`]);
        }

        const excludedDiagnosticsOptions = tl.getDelimitedInput("diagnosticsExcludedOptions", ",");
        if(excludedDiagnosticsOptions.length){
            tool = tool
                .arg(['--exclude-diagnostics', `${excludedDiagnosticsOptions.join(" ")}`]);
        }

        const verbosityOption = tl.getInput("verbosityOption", false);
        if(verbosityOption){
            tool = tool
                .arg(['--verbosity', `${verbosityOption.toLowerCase()}`]);
        }
        
        const runReturnCode = await tool
            .argIf(isDebug == true, ['--binarylog', `${tl.getVariable("Build.ArtifactStagingDirectory")}/Logs/format.binlog`])
            .arg('--verify-no-changes')
            .arg(['--report', `${tl.getVariable("Build.ArtifactStagingDirectory")}/CodeAnalysisLogs/format.json`])
            .execAsync(toolRunOptions);

        tl.setResult(runReturnCode == 0 ? tl.TaskResult.Succeeded : tl.TaskResult.Failed, `Return code was: ${runReturnCode}`, true);
    }
    catch (error: any) {
        tl.setResult(tl.TaskResult.Failed, error.message, true);
    }
}
run();