import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { Constants } from './constants';
import * as tl from 'azure-pipelines-task-lib/task';

export interface IExtensionContext {
    readonly Environment: IEnvironment,
    readonly Task: ITask,
    readonly Settings: ISettings
}

export interface IEnvironment {
    readonly IsDebug: boolean
    readonly IsPullRequest: boolean,
    readonly CollectionUri: string,
    readonly ProjectId: string, 
    readonly RepositoryId: string,
    readonly RepositoryPath: string,
    readonly PullRequestId: number,
    readonly ReviewedCommitId: string,
    readonly TargetBranch: string,
    readonly ScmType: string,
    readonly TelemetryOptout: boolean
}

export interface ISettings {
    readonly UseGlobalTool: boolean,
    readonly Command: string,
    readonly WorkspacePath: string,
    readonly DiffProvider: string,
    readonly WorkingDirectoryPath: string | undefined,
    readonly OnlyChangedFiles: boolean,
    readonly FileGlobPatterns: ReadonlyArray<string>,
    readonly IncludedFiles: ReadonlyArray<string>,
    readonly ExcludedFiles: ReadonlyArray<string>,
    readonly SeverityLevel: string,
    readonly NoRestore: boolean,
    readonly IncludeGenerated: boolean,
    readonly IncludedDiagnosticIds: ReadonlyArray<string>,
    readonly ExcludedDiagnosticIds: ReadonlyArray<string>,
    readonly VerbosityLevel: string,
    readonly BinaryLogPath: string,
    readonly ReportFilePath: string,
    readonly FilesToCheckRspPath: string,
    readonly FilesToIncludesRspPath: string,
    readonly FilesToExcludepRspPath: string
}

export interface ITask {
    readonly Name: string,
    readonly IsPreview: boolean,
    readonly Version: string,

    GetUserAgent(): string;
}

interface TaskJson {
    name: string;
    preview: boolean;
    version: {
        Major: number;
        Minor: number;
        Patch: number;
    };
}

export async function getExtensionContext(rootDir: string): Promise<IExtensionContext> {
    // Common
    const isDebug = tl.getVariable(Constants.VarDebug) == 'True';
    const artifactStagingDirectoryPath = tl.getVariable(Constants.VarArtifactStagingDirectory)!;

    // ADO-API
    const baseURI = tl.getVariable(Constants.VarCollectionUri)!;

    // Pipeline context
    const projectId = tl.getVariable(Constants.VarProjectId)!;
    const repositoryId = tl.getVariable(Constants.VarRepositoryId)!;
    const pullRequestId = Number(tl.getVariable(Constants.VarPullRequestId)!);
    const repositoryPath = tl.getVariable(Constants.VarRepositoryPath)!;
    const targetBranch = tl.getVariable(Constants.VarTargetBranch)!;
    const reviewedCommitId = tl.getVariable(Constants.VarPullRequestCommit)!;
    const isPullRequest = tl.getVariable(Constants.VarBuildReason)! == "PullRequest";
    const repositoryProvider = tl.getVariable(Constants.VarRepositoryProvider)!;

    // Settings
    const useGlobalTool = tl.getBoolInput(Constants.InputUseGlobalToolOption);
    const command = tl.getInputRequired(Constants.InputCommand);
    const severityLevel = tl.getInputRequired(Constants.InputSeverityOption);
    const workspacePath = tl.getPathInput(Constants.InputWorkspaceOption, true)!;
    const onlyChangedFiles = tl.getBoolInput(Constants.InputOnlyChangedFiles);
    const diffProvider = tl.getInputRequired(Constants.InputDiffProviderOption);
    const fileGlobPatterns = tl.getDelimitedInput(Constants.InputFileGlobPatternOption, '\n'); //TODO: see why os.EOL doens't work on windows-latest
    const workingDirectoryPath = tl.getPathInput(Constants.InputWorkingDirectoryOption, false);
    const includeFiles = tl.getDelimitedInput(Constants.InputIncludeOptions, os.EOL);
    const excludedFiles = tl.getDelimitedInput(Constants.InputExcludeOptions, os.EOL);
    const noRestore = tl.getBoolInput(Constants.InputNoRestoreOption);
    const includeGenerated = tl.getBoolInput(Constants.InputIncludeGeneratedOption);
    const includedDiagnosticIds = tl.getDelimitedInput(Constants.InputDiagnosticsOptions, ",");
    const excludedDiagnosticIds = tl.getDelimitedInput(Constants.InputDiagnosticsOptions, ",");
    const verbosityLevel = tl.getInputRequired(Constants.InputVerbosityOption);
    const telemetryOptout = tl.getVariable(Constants.VarTelemetryOptout) === 'True';

    /// Path
    const filesToCheckRspPath = path.join(repositoryPath, "FilesToCheck.rsp");
    const filesToIncludesRspPath = path.join(repositoryPath, "Included.rsp");
    const filesToExcludepRspPath = path.join(repositoryPath, "Excluded.rsp");
    const binaryLogPath = path.join(artifactStagingDirectoryPath, 'Logs', "format.binlog");
    const reportFilePath = path.join(artifactStagingDirectoryPath, 'CodeAnalysisLogs', "format.json");

    const ctx: IExtensionContext = {
        Environment: {
            IsDebug: isDebug,
            IsPullRequest: isPullRequest,
            CollectionUri: baseURI,
            ProjectId: projectId,
            RepositoryId: repositoryId,
            RepositoryPath: repositoryPath,
            PullRequestId: pullRequestId,
            ReviewedCommitId: reviewedCommitId,
            TargetBranch: targetBranch,
            ScmType: repositoryProvider,
            TelemetryOptout: telemetryOptout
        },
        Task: getTaskInformation(rootDir),
        Settings: {
            UseGlobalTool: useGlobalTool,
            Command: command,
            SeverityLevel: severityLevel,
            WorkspacePath: workspacePath,
            DiffProvider: diffProvider,
            WorkingDirectoryPath: workingDirectoryPath,
            OnlyChangedFiles: onlyChangedFiles,
            FileGlobPatterns: fileGlobPatterns,
            IncludedFiles: includeFiles,
            ExcludedFiles: excludedFiles,
            NoRestore: noRestore,
            IncludeGenerated: includeGenerated,
            IncludedDiagnosticIds: includedDiagnosticIds,
            ExcludedDiagnosticIds: excludedDiagnosticIds,
            VerbosityLevel: verbosityLevel.toLowerCase(),
            BinaryLogPath: binaryLogPath,
            ReportFilePath: reportFilePath,
            FilesToCheckRspPath: filesToCheckRspPath,
            FilesToIncludesRspPath: filesToIncludesRspPath,
            FilesToExcludepRspPath: filesToExcludepRspPath
        }
    } as const;

    if(isDebug){
        console.dir(ctx);
    }

    return ctx;
}

function getTaskInformation(rootDir: string): ITask {
    const taskJsonPath = tl.resolve(rootDir, 'task.json');    

    let taskJsonContent: string;
    try {
        taskJsonContent = fs.readFileSync(taskJsonPath, 'utf8');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read task definition file at '${taskJsonPath}': ${message}`);
    }

    let taskJson: TaskJson;
    try {
        taskJson = JSON.parse(taskJsonContent) as TaskJson;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse task definition file at '${taskJsonPath}': ${message}`);
    }

    return {
        Name: taskJson.name,
        IsPreview: taskJson.preview,
        Version: `${taskJson.version.Major}.${taskJson.version.Minor}.${taskJson.version.Patch}`,

        GetUserAgent(): string {
            return `${this.Name}/${this.Version}`;
        }
    } as const;
}