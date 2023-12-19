import tl = require('azure-pipelines-task-lib/task');
import adoApi = require('azure-devops-node-api');
import vsoInterface = require('azure-devops-node-api/interfaces/common/VsoBaseInterfaces');
import idtInterface = require('azure-devops-node-api/interfaces/IdentitiesInterfaces');
import GitInterfaces = require('azure-devops-node-api/interfaces/GitInterfaces');
import ReportInterfaces = require('../common/reportReader')
import CommonInterfaces = require('../common/comments')
import ct = require('../common/context');

function GetApiAuthHandler(authType: Readonly<string>, serviceEndpointId: Readonly<string>): vsoInterface.IRequestHandler {
    let authHandler: vsoInterface.IRequestHandler;
    switch(authType)
    {
        case 'none':
            tl.debug('Using auth-scheme-none and System.AccessToken.');
            const accessToken = tl.getVariable("System.AccessToken")!;
            authHandler = adoApi.getHandlerFromToken(accessToken);
            break;
        case 'basic':
            tl.debug('Using auth-scheme-basic.');
            const username = tl.getEndpointAuthorizationParameterRequired(serviceEndpointId, 'username');
            const password = tl.getEndpointAuthorizationParameterRequired(serviceEndpointId, 'username');
            authHandler = adoApi.getBasicHandler(username, password);
            break;
        case 'token':
            tl.debug('Using auth-scheme-token, PAT.');
            const pat = tl.getEndpointAuthorizationParameterRequired(serviceEndpointId, 'apitoken');
            authHandler = adoApi.getPersonalAccessTokenHandler(pat);
            break;
        default:
            tl.error(`Unknow scheme-type provided: ${authType}, abording.`)
            throw new Error('Authentification information not provided');
    }
    return authHandler;
}

async function GetCurrentIdentity(authHandler: Readonly<vsoInterface.IRequestHandler>, authType: Readonly<string>, baseUri: Readonly<string>)
: Promise<{identity: idtInterface.Identity, webApi: adoApi.WebApi}> {
    const vsts: adoApi.WebApi = new adoApi.WebApi(baseUri, authHandler);
    let vstsAuthUser: idtInterface.Identity;
    try {
        const connectionData = await vsts.connect();
        if(connectionData.authenticatedUser === undefined){
            throw new Error('Authentication information can\'t be read.');
        }
        vstsAuthUser = connectionData.authenticatedUser;
        tl.debug(`Working as: ${vstsAuthUser.providerDisplayName} | ${vstsAuthUser.id}`);
    } catch (connectionError) {
        tl.error(`While trying to connect to ${baseUri}, using ${authType} see: ${connectionError}`);
        throw new Error('Authentication information not provided.');
    }

    return {
        identity: vstsAuthUser,
        webApi: vsts
    };
}

export async function GetApiContext(
    authType: Readonly<string>,
    serviceEndpointId: Readonly<string>,
    baseUri: Readonly<string>)
    : Promise<ct.IApiContext> {

    const authHandler = GetApiAuthHandler(authType, serviceEndpointId);
    const { identity, webApi } = await GetCurrentIdentity(authHandler, authType, baseUri);
    
    return {
        AuthHandler: authHandler,
        AuthIdentity: identity,
        AdoWebApi: webApi,
        GitApi: await webApi.getGitApi()
    } as const;
}

export async function GetPullRequest(ctx:Readonly<ct.IExtensionContext>): Promise<GitInterfaces.GitPullRequest> {
    const pullRequest = await ctx.ApiContext.GitApi.getPullRequestById(ctx.Environment.PullRequestId, ctx.Environment.TeamProjectId); 
    console.debug(`PR loaded: ${pullRequest.pullRequestId}`);
    if(pullRequest.isDraft
        || pullRequest.status == GitInterfaces.PullRequestStatus.Abandoned 
        || pullRequest.status == GitInterfaces.PullRequestStatus.Completed
    ){
        throw new Error('This task won\'t comment over a draft or Completed/Abandoned PullRequest.');
    }

    return pullRequest;
}

export async function GetPullRequestIterations(ctx:Readonly<ct.IExtensionContext>): Promise<GitInterfaces.GitPullRequestIteration[]> {
    return await ctx.ApiContext.GitApi
        .getPullRequestIterations(
            ctx.Environment.RepositoryId,
            ctx.Environment.PullRequestId,
            ctx.Environment.TeamProjectId,
            false
            );
}

export async function GetPullRequestIterationChanges(ctx:Readonly<ct.IExtensionContext>, iterationId: Readonly<number>): Promise<GitInterfaces.GitPullRequestIterationChanges> {
    return await ctx.ApiContext.GitApi
        .getPullRequestIterationChanges(
            ctx.Environment.RepositoryId,
            ctx.Environment.PullRequestId,
            iterationId,
            ctx.Environment.TeamProjectId,
            undefined,
            undefined,
            iterationId-1
            );
}

export async function GetThreads(ctx:Readonly<ct.IExtensionContext>, fromIterationScopeId: Readonly<number>, toIterationScopeId: Readonly<number>): Promise<GitInterfaces.GitPullRequestCommentThread[]> {
    return await ctx.ApiContext.GitApi
        .getThreads(
            ctx.Environment.RepositoryId,
            ctx.Environment.PullRequestId,
            ctx.Environment.TeamProjectId,
            toIterationScopeId,
            fromIterationScopeId
        );
}

export async function CreateThread(ctx: Readonly<ct.IExtensionContext>, thread: Readonly<GitInterfaces.GitPullRequestCommentThread>): Promise<GitInterfaces.GitPullRequestCommentThread>{
    return await ctx.ApiContext.GitApi
        .createThread(
            thread,
            ctx.Environment.RepositoryId,
            ctx.Environment.PullRequestId,
            ctx.Environment.TeamProjectId,
            );
}

export interface IFileChangeSet {
    readonly IterationId: number | undefined,
    readonly IterationChange: GitInterfaces.GitPullRequestChange | undefined
}

export interface IIterationContainer {
    IterationId: number,
    IterationChanges: GitInterfaces.GitPullRequestIterationChanges
}

export function findLatestChangeFor(workingScopeOfIteration: ReadonlyArray<IIterationContainer>, localFilePath:string): IFileChangeSet {
    for (let i = workingScopeOfIteration.length - 1; i >= 0; i--) {
        const iteration = workingScopeOfIteration[i];
        const foundChange = iteration.IterationChanges.changeEntries?.find((change) => {
            return change.item?.path === localFilePath;
        });
     
        if (foundChange) {
            return {
            IterationId: iteration.IterationId,
            IterationChange: foundChange
            };
        }
    }

    return { IterationId: undefined, IterationChange: undefined };
}

export async function CreateThreadForMultipleDiagnostics(
    ctx: Readonly<ct.IExtensionContext>,
    filePath: Readonly<string>,
    fileChangeSet: Readonly<IFileChangeSet>,
    commentContent: Readonly<string>,
    iterationScopeId: Readonly<number>
    ){
    let threadContext: GitInterfaces.CommentThreadContext;
    if(fileChangeSet.IterationChange?.changeType == GitInterfaces.VersionControlChangeType.Edit){
        threadContext = {
            filePath: filePath,                            
            rightFileStart: {
                line: 1,
                offset: 1
            },
            rightFileEnd: {
                line: 1,
                offset: 1
            }
        };
    } else {
        threadContext = {
            filePath: filePath,                            
            leftFileStart: {
                line: 1,
                offset: 1
            },
            leftFileEnd: {
                line: 1,
                offset: 1
            }
        };
    }

    const threadToAdd: GitInterfaces.GitPullRequestCommentThread = {
        comments: [
            {
                parentCommentId: 0, 
                commentType: GitInterfaces.CommentType.Text,
                content: commentContent
            }
        ],
        status: GitInterfaces.CommentThreadStatus.Active,
        isDeleted: false,
        threadContext: threadContext,
        pullRequestThreadContext: {
            changeTrackingId: fileChangeSet.IterationChange?.changeTrackingId,
            iterationContext: {
                firstComparingIteration: iterationScopeId,
                secondComparingIteration: iterationScopeId
            }
        }
    };

    await CreateThread(ctx, threadToAdd);
}

export async function CreateThreadForSingleDiagnostic(
    ctx: Readonly<ct.IExtensionContext>,
    documentWithProblem: Readonly<ReportInterfaces.IFileProblem>,
    filePath: Readonly<string>,
    fileChangeSet: Readonly<IFileChangeSet>,
    iterationScopeId: Readonly<number>
) {
    let threadContext: GitInterfaces.CommentThreadContext;
    if(fileChangeSet.IterationChange?.changeType == GitInterfaces.VersionControlChangeType.Edit){
        threadContext = {
            filePath: filePath,                            
            rightFileStart: {
                line: documentWithProblem.LineNumber,
                offset: documentWithProblem.CharNumber
            },
            rightFileEnd: {
                line: documentWithProblem.LineNumber,
                offset: documentWithProblem.CharNumber
            }
        };
    } else {
        threadContext = {
            filePath: filePath,                            
            leftFileStart: {
                line: documentWithProblem.LineNumber,
                offset: documentWithProblem.CharNumber
            },
            leftFileEnd: {
                line: 1,
                offset: 1
            }
        };
    }

    let threadToAdd: GitInterfaces.GitPullRequestCommentThread = {
            comments: [
                {
                    parentCommentId: 0, 
                    commentType: GitInterfaces.CommentType.Text,
                    content: documentWithProblem.FormatDescription
                }
            ],
            status: GitInterfaces.CommentThreadStatus.Active,
            isDeleted: false,
            threadContext: threadContext,
            pullRequestThreadContext: {
                changeTrackingId: fileChangeSet.IterationChange?.changeTrackingId,
                iterationContext: {
                    firstComparingIteration: iterationScopeId,
                    secondComparingIteration: iterationScopeId
                }
            }
    };
    await CreateThread(ctx, threadToAdd);
}

export async function CreateComment(ctx:Readonly<ct.IExtensionContext>, threadId: Readonly<number>, comment: Readonly<GitInterfaces.Comment>): Promise<GitInterfaces.Comment> {
    return await ctx.ApiContext.GitApi
        .createComment(
            comment,
            ctx.Environment.RepositoryId,
            ctx.Environment.PullRequestId,
            threadId,
            ctx.Environment.TeamProjectId
        );
}

export async function UpdateCommentContent(ctx:Readonly<ct.IExtensionContext>, threadId: Readonly<number>, commentId: Readonly<number>, content: Readonly<string>) {
    return await ctx.ApiContext.GitApi
        .updateComment(
            {
                content: content
            },
            ctx.Environment.RepositoryId,
            ctx.Environment.PullRequestId,
            threadId,
            commentId,
            ctx.Environment.TeamProjectId
        );
}
 
export async function UpdateThreadStatus(ctx:Readonly<ct.IExtensionContext>, threadId: Readonly<number>, status: Readonly<GitInterfaces.CommentThreadStatus>) {
    return await ctx.ApiContext.GitApi
        .updateThread(
            {
                status: status
            },
            ctx.Environment.RepositoryId,
            ctx.Environment.PullRequestId,
            threadId,
            ctx.Environment.TeamProjectId
        );
}