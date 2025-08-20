import tl = require('azure-pipelines-task-lib/task');
import rr = require('./reportReader')
import path = require('node:path');
import adoProvider = require('../providers/ado');
import adoApi = require('azure-devops-node-api');
import gitApi = require('azure-devops-node-api/GitApi');

export interface IExtensionContext {
    readonly Environment: IEnvironment,
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
    readonly LocalWorkingPath: string   
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
    VarArtifactStagingDirectory: 'Build.ArtifactStagingDirectory'
} as const;

export async function getExtensionContext(): Promise<IExtensionContext> {
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
        },
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