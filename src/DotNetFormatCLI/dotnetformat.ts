import os = require('os');
import path = require('node:path');
import tl = require('azure-pipelines-task-lib/task');
import tr = require("azure-pipelines-task-lib/toolrunner");
import gitTool = require('./utils');

export const Constants = {
    // Task input
    InputWorkingDirectoryOption: 'workingDirectory',
    InputUseGlobalToolOption: 'useGlobalTool',
    InputCommand: 'command',
    InputWorkspaceOption: 'workspace',
    InputOnlyChangedFiles: 'onlyChangedFiles',
    InputIncludeOptions: 'include',
    InputExcludeOptions: 'exclude',
    InputSeverityOption: 'severity',
    InputNoRestoreOption: 'noRestore',
    InputIncludeGeneratedOption: 'includeGenerated',
    InputDiagnosticsOptions: 'diagnostics',
    InputDiagnosticsExcludedOptions: 'diagnosticsExcluded',
    InputVerbosityOption: 'verbosity',
    // Task output
    //TODO: add output
    OutputResult: 'format-result',
    // Env.
    VarDebug: 'System.Debug',
    VarTargetBranch: 'System.PullRequest.TargetBranch',
    VarPullRequestId: 'System.PullRequest.PullRequestId', 
    VarBuildReason: 'Build.Reason',
    VarRepositoryLocalPath: 'Build.Repository.LocalPath',
    VarArtifactStagingDirectory: 'Build.ArtifactStagingDirectory'
} as const;


async function run() {
    try {
        const isDebug = tl.getVariable(Constants.VarDebug) == 'True';
        const isPullRequest = tl.getVariable(Constants.VarBuildReason)! == "PullRequest";
        const localWorkingPath = tl.getVariable(Constants.VarRepositoryLocalPath)!;
        
        // Get the tools 
        const workingDirectoryOption = tl.getPathInput(Constants.InputWorkingDirectoryOption);
        let toolRunOptions: tr.IExecOptions = {
            cwd: workingDirectoryOption == null ? localWorkingPath : workingDirectoryOption 
        };

        const useGlobalToolOption = tl.getBoolInput(Constants.InputUseGlobalToolOption);
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
        const commandToRun = tl.getInput(Constants.InputCommand, true);
        if(commandToRun === "custom"){
            tl.setResult(tl.TaskResult.Failed, "Custom command isn't impl. yet!");
            return;
        } else if(commandToRun === "fix"){
            tl.setResult(tl.TaskResult.Failed, "Fix command isn't impl. yet!");
            return;
        }

        const workspaceOption = tl.getPathInput(Constants.InputWorkspaceOption)!;
        const onlyChangedFiles = tl.getBoolInput(Constants.InputOnlyChangedFiles);      

        if(onlyChangedFiles){
            if(!isPullRequest){
                console.error("`Build.Reason` != PullRequest, can't get the diff.")
                tl.setResult(tl.TaskResult.Failed, "Can't find diff. between target and source branch, for PullRequest"); //TODO: better log
                return;
            }

            const pullRequestTargetBranch = tl.getVariable(Constants.VarTargetBranch)!;
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
            
            const includeOptions = tl.getDelimitedInput(Constants.InputIncludeOptions, os.EOL);
            if(includeOptions.length){
                const includedRspFilePath = path.normalize(path.join(localWorkingPath, "Included.rsp"));
                tl.writeFile(includedRspFilePath, includeOptions.join(os.EOL));
                console.debug(`Include file ${includedRspFilePath} with ${includeOptions.length}`);
                tool = tool
                    .arg(['--include', `@${includedRspFilePath}`]);
            }            
        }

        const excludeOptions = tl.getDelimitedInput(Constants.InputExcludeOptions, os.EOL);
        if(excludeOptions.length){
            const excludedRspFilePath = path.normalize(path.join(localWorkingPath, "Excluded.rsp"));
            tl.writeFile(excludedRspFilePath, excludeOptions.join(os.EOL));
            console.debug(`Include file ${excludedRspFilePath} with ${excludeOptions.length}`);
            tool = tool
                .arg(['--exclude', `@${excludedRspFilePath}`]);
        }

        const severityOption = tl.getInput(Constants.InputSeverityOption, false);
        if(severityOption){
            tool = tool
                .arg(['--severity', `${severityOption}`]);
        }
  
        // advanced options
        const noRestoreOption = tl.getBoolInput(Constants.InputNoRestoreOption, false);
        if(noRestoreOption){
            tool = tool
                .arg("--no-restore");
        }
        
        const includeGeneratedOption = tl.getBoolInput(Constants.InputIncludeGeneratedOption, false);
        if(includeGeneratedOption){
            tool = tool
                .arg("--include-generated");
        }     
    
        const diagnosticsOptions = tl.getDelimitedInput(Constants.InputDiagnosticsOptions, ",");
        if(diagnosticsOptions.length){
            tool = tool
                .arg(['--diagnostics', `${diagnosticsOptions.join(" ")}`]);
        }

        const excludedDiagnosticsOptions = tl.getDelimitedInput(Constants.InputDiagnosticsExcludedOptions, ",");
        if(excludedDiagnosticsOptions.length){
            tool = tool
                .arg(['--exclude-diagnostics', `${excludedDiagnosticsOptions.join(" ")}`]);
        }

        const verbosityOption = tl.getInput(Constants.InputVerbosityOption, false);
        if(verbosityOption){
            tool = tool
                .arg(['--verbosity', `${verbosityOption.toLowerCase()}`]);
        }
        
        const runReturnCode = await tool
            .argIf(isDebug == true, ['--binarylog', `${tl.getVariable(Constants.VarArtifactStagingDirectory)}/Logs/format.binlog`])
            .arg('--verify-no-changes')
            .arg(['--report', `${tl.getVariable(Constants.VarArtifactStagingDirectory)}/CodeAnalysisLogs/format.json`])
            .execAsync(toolRunOptions);

        tl.setResult(runReturnCode == 0 ? tl.TaskResult.Succeeded : tl.TaskResult.Failed, `Return code was: ${runReturnCode}`, true);
    }
    catch (error: any) {
        tl.setResult(tl.TaskResult.Failed, error.message, true);
    }
}
run();