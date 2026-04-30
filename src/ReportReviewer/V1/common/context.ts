import * as tl from 'azure-pipelines-task-lib/task';
import * as fs from 'node:fs';
import * as rr from './reportReader';
import * as path from 'node:path';
import * as adoProvider from '../providers/ado';
import * as adoApi from 'azure-devops-node-api';
import * as gitApi from 'azure-devops-node-api/GitApi';

export interface IExtensionContext {
    readonly Environment: IEnvironment,
    readonly Task: ITask,
    readonly Settings: ISettings,
    readonly ApiContext:  IApiContext
}

export interface IEnvironment {
    readonly IsDebug: boolean
    readonly CollectionUri: string,
    readonly TeamProjectId: string, 
    readonly RepositoryId: string,
    readonly PullRequestId: number,
    readonly WorkingCommitId: string,
    readonly LocalWorkingPath: string,
    readonly TelemetryOptout: boolean
}

export interface ISettings {
    readonly ServiceEndpointId: string,
    readonly AuthentificationType: string,
    readonly MinSeverityLevel: rr.SeverityLevel,
    readonly SpamThreshold: number,
    readonly IgnoredDiagnosticIds: ReadonlyArray<string>,
    readonly ReportFilePath: string
}

export interface IApiContext {
    readonly AuthHandler: any,
    readonly AuthIdentity: any,
    readonly AdoWebApi: adoApi.WebApi,
    readonly GitApi: gitApi.IGitApi
}

export const Constants = {
    // Task input
    InputAdoConnectedServiceName: 'connectedServiceName',
    InputMinimumSeverityLevel: 'minSeverityLevel',
    InputIgnoredDiagnosticIds: 'ignoredDiagnosticIds',
    InputSpamThreshold: 'spamThreshold',
    // Task output
    OutputResult: 'format-reviewer-result',
    // Env.
    VarDebug: 'System.Debug',
    VarCollectionUri: 'System.CollectionUri',
    VarProjectId: 'System.TeamProjectId',
    VarPullRequestId: 'System.PullRequest.PullRequestId', 
    VarPullRequestCommitId: 'System.PullRequest.SourceCommitId',
    VarBuildReason: 'Build.Reason',
    VarRepositoryId: 'Build.Repository.ID',
    VarRepositoryProvider: 'Build.Repository.Provider',
    VarRepositoryLocalPath: 'Build.Repository.LocalPath',
    VarArtifactStagingDirectory: 'Build.ArtifactStagingDirectory',
    VarTelemetryOptout: 'Telemetry.Optout'
} as const;

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

    /// API related 
    const baseURI = tl.getVariable(Constants.VarCollectionUri)!;
    const projectId = tl.getVariable(Constants.VarProjectId)!;
    const repositoryId = tl.getVariable(Constants.VarRepositoryId)!;
    const pullRequestId = Number(tl.getVariable(Constants.VarPullRequestId)!);
    const reviewedCommitId = tl.getVariable(Constants.VarPullRequestCommitId)!;                

    /// Settings
    const serviceEndpointId = tl.getInputRequired(Constants.InputAdoConnectedServiceName);
    const authSchemeType= (tl.getEndpointAuthorizationSchemeRequired(serviceEndpointId)).toLowerCase();
    const minSeverityLevelInput = tl.getInputRequired(Constants.InputMinimumSeverityLevel);
    const minSeverityLevel = rr.mapInputToSeverityLevel(minSeverityLevelInput);
    const ignoredDiagnosticIds = tl.getDelimitedInput(Constants.InputIgnoredDiagnosticIds, ',')!;
    const spamThreshold = parseInt(tl.getInputRequired(Constants.InputSpamThreshold)!);
    const telemetryOptout = tl.getVariable(Constants.VarTelemetryOptout) === 'True';

    /// Report related
    const localWorkingPath = tl.getVariable(Constants.VarRepositoryLocalPath)!;
    const artifactStagingDirectoryPath = tl.getVariable(Constants.VarArtifactStagingDirectory)!;

    // API context
    //TODO: add Github support?
    const apiContext = await adoProvider.GetApiContext(authSchemeType, serviceEndpointId, baseURI);

    tl.debug(`ProjectId[${typeof(projectId)}]: ${projectId}, RepositoryId[${typeof(repositoryId)}]: ${repositoryId}, PullRequestId [${typeof(pullRequestId)}]: ${pullRequestId}`);
    return {
        Environment: {
            IsDebug: isDebug,
            CollectionUri: baseURI,
            TeamProjectId: projectId,
            RepositoryId: repositoryId,
            PullRequestId: pullRequestId,
            WorkingCommitId: reviewedCommitId,
            LocalWorkingPath: localWorkingPath,
            TelemetryOptout: telemetryOptout
        },
        Task: getTaskInformation(rootDir),
        Settings: {
            ServiceEndpointId: serviceEndpointId,
            AuthentificationType: authSchemeType,
            MinSeverityLevel: minSeverityLevel,
            SpamThreshold: spamThreshold,
            IgnoredDiagnosticIds: ignoredDiagnosticIds,
            ReportFilePath: path.join(artifactStagingDirectoryPath, 'CodeAnalysisLogs', 'format.json') //TODO: get from output var? and/or allow custom path 
        },
        ApiContext: apiContext
    } as const;
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