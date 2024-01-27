import os = require('node:os');
import tl = require('azure-pipelines-task-lib/task');
import tr = require('azure-pipelines-task-lib/toolrunner');
import provider = require('./diff-provider/provider');
import ct = require('./common/context');

async function run() {
    try {
        // Get context
        const extensionContext = await ct.getExtensionContext();
        
        // Get the tools 
        let toolRunOptions: tr.IExecOptions = {
            cwd: extensionContext.Settings.WorkingDirectoryPath == null ? 
                            extensionContext.Environment.RepositoryPath : extensionContext.Settings.WorkingDirectoryPath 
        };

        let toolPath: string;
        let tool:tr.ToolRunner;
        if(extensionContext.Settings.UseGlobalTool){
            toolPath = tl.which("dotnet-format", true);
            tool = tl.tool(toolPath);
        } else{
            toolPath = tl.which("dotnet", true);
            tool = tl
                .tool(toolPath)
                .arg("format");
        }
        
        if(extensionContext.Environment.IsDebug){
            await tl
                .tool(toolPath)
                .line("format --version")
                .execAsync(toolRunOptions);
        }

        // command
        const commandToRun = extensionContext.Settings.Command;
        if(commandToRun === "custom"){
            tl.setResult(tl.TaskResult.Failed, "Custom command isn't impl. yet!");
            return;
        } else if(commandToRun === "fix"){
            tl.setResult(tl.TaskResult.Failed, "Fix command isn't impl. yet!");
            return;
        }

        const workspaceOption = extensionContext.Settings.WorkspacePath;
        if(extensionContext.Settings.OnlyChangedFiles){
            if(!extensionContext.Environment.IsPullRequest){
                console.error("`Build.Reason` != PullRequest, can't get the diff.")
                tl.setResult(tl.TaskResult.Failed, "Can't find diff. between target and source branch, for PullRequest"); //TODO: better log
                return;
            }

            const fileGlobPattern = extensionContext.Settings.FileGlobPatterns; 
            const diffProvider = provider.DiffProviderFactory.create(extensionContext);
            const changeSet = await diffProvider.getChangeFor(fileGlobPattern);
            const rspFilePath = extensionContext.Settings.FilesToCheckRspPath;
            tl.writeFile(rspFilePath, changeSet.join(os.EOL));

            tool = tool
                .arg(workspaceOption)
                .arg(['--include', `@${rspFilePath}`]);
        } else {
            tool = tool.arg(workspaceOption);
            
            const includeOptions = extensionContext.Settings.IncludedFiles;
            if(includeOptions.length){
                const includedRspFilePath = extensionContext.Settings.FilesToIncludesRspPath;
                tl.writeFile(includedRspFilePath, includeOptions.join(os.EOL));
                console.debug(`Include file ${includedRspFilePath} with ${includeOptions.length}`);
                tool = tool
                    .arg(['--include', `@${includedRspFilePath}`]);
            }            
        }

        const excludeOptions = extensionContext.Settings.ExcludedFiles;
        if(excludeOptions.length){
            const excludedRspFilePath = extensionContext.Settings.FilesToExcludepRspPath;
            tl.writeFile(excludedRspFilePath, excludeOptions.join(os.EOL));
            console.debug(`Include file ${excludedRspFilePath} with ${excludeOptions.length}`);
            tool = tool
                .arg(['--exclude', `@${excludedRspFilePath}`]);
        }

        tool = tool
            .arg(['--severity', `${extensionContext.Settings.SeverityLevel}`]);
  
        // advanced options
        const noRestoreOption = extensionContext.Settings.NoRestore;
        if(noRestoreOption){
            tool = tool
                .arg("--no-restore");
        }
        
        const includeGeneratedOption = extensionContext.Settings.IncludeGenerated;
        if(includeGeneratedOption){
            tool = tool
                .arg("--include-generated");
        }     
    
        const diagnosticsOptions = extensionContext.Settings.IncludedDiagnosticIds;
        if(diagnosticsOptions.length){
            tool = tool
                .arg(['--diagnostics', `${diagnosticsOptions.join(" ")}`]);
        }

        const excludedDiagnosticsOptions = extensionContext.Settings.ExcludedDiagnosticIds;
        if(excludedDiagnosticsOptions.length){
            tool = tool
                .arg(['--exclude-diagnostics', `${excludedDiagnosticsOptions.join(" ")}`]);
        }

        tool = tool
            .arg(['--verbosity', `${extensionContext.Settings.VerbosityLevel}`]);
        
        const runReturnCode = await tool
            .argIf(extensionContext.Environment.IsDebug == true, ['--binarylog', `${extensionContext.Settings.BinaryLogPath}`])
            .arg('--verify-no-changes')
            .arg(['--report', `${extensionContext.Settings.ReportFilePath}`])
            .execAsync(toolRunOptions);

        tl.setResult(runReturnCode == 0 ? tl.TaskResult.Succeeded : tl.TaskResult.Failed, `Return code was: ${runReturnCode}`, true);
    }
    catch (error: any) {
        tl.error(error);
        tl.setResult(tl.TaskResult.Failed, error.message, true);
    }
}
run();