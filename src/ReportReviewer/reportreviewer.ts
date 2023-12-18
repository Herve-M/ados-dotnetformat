import tl = require('azure-pipelines-task-lib/task');
import adoApi = require('azure-devops-node-api');
import vsoInterface = require('azure-devops-node-api/interfaces/common/VsoBaseInterfaces');
import idtInterface = require('azure-devops-node-api/interfaces/IdentitiesInterfaces');
import GitInterfaces = require('azure-devops-node-api/interfaces/GitInterfaces');
import rr = require('./common/reportReader')
import commentHelper = require('./common/comments')
import { IExtensionContext } from './common/context';

const Constants = {
    InputAdoCOnnectedServiceName: 'connectedServiceName',
    InputMinimumSeverityLevel: 'minSeverityLevel',
    InputIgnoredDiagnosticIds: 'ignoredDiagnosticIds',
    InputSpamThreshold: 'spamThreshold',
    //
    VarDebug: 'System.Debug',
    VarBuildReason: 'Build.Reason',
    VarRepositoryProvider: 'Build.Repository.Provider',
    //
    OutputResult: 'format-reviewer-result',
} as const;

async function run() {
    try {        
        const isPullRequest = tl.getVariable(Constants.VarBuildReason)! == "PullRequest";
        if(!isPullRequest){
            tl.setResult(tl.TaskResult.Failed, "This task can't work outside of PullRequests.", true);
            return;
        }

        const provider = tl.getVariable(Constants.VarRepositoryProvider)!;
        if(!provider.startsWith('Tfs')){
            tl.setResult(tl.TaskResult.Failed, "This task only work for Azure DevOps Service.", true);
            return;
        }

        // Load report.json file
        const localWorkingPath = tl.getVariable("Build.Repository.LocalPath")!;
        const reportFilePath = `${tl.getVariable("Build.ArtifactStagingDirectory")}/CodeAnalysisLogs/format.json`; //TODO: get from output var? and/or allow custom path 
        const reportContent = await rr.importReport(reportFilePath, localWorkingPath);
        if(reportContent.length == 0){
            tl.setResult(tl.TaskResult.Succeeded, "Nothing to do.", true);
            return;
        }
        const reportGroupedByFiles = rr.groupReport(reportContent);
        tl.debug(`Report: ${reportContent.length} document(s) impacted`);

        // Common
        const isDebug = tl.getVariable(Constants.VarDebug) == 'True';  

        // Settings
        const minSeverityLevelInput = tl.getInputRequired(Constants.InputMinimumSeverityLevel);
        const minSeverityLevel = rr.mapInputToSeverityLevel(minSeverityLevelInput);
        const ignoredDiagnosticIds = tl.getDelimitedInput(Constants.InputIgnoredDiagnosticIds, ',', true)!;
        const spamThreshold = parseInt(tl.getInputRequired(Constants.InputSpamThreshold)!);

        const extensionContext :IExtensionContext = {
            Environement: {
                IsDebug: isDebug
            },
            Settings: {
                MinSeverityLevel: minSeverityLevel,
                SpamThreshold: spamThreshold,
                IgnoredDiagnosticIds: ignoredDiagnosticIds
            }
        };

        // API related 
        const baseURI = tl.getVariable("System.CollectionUri")!;
        const projectId = tl.getVariable("System.TeamProjectId")!;
        const repositoryId = tl.getVariable("Build.Repository.ID")!;
        const pullRequestId = Number(tl.getVariable("System.PullRequest.PullRequestId")!);
        const reviewedCommitId = tl.getVariable("System.PullRequest.SourceCommitId")!;                

        // ADO-API Auth.
        let authHandler: vsoInterface.IRequestHandler;
        const serviceEndpointID = tl.getInputRequired('connectedServiceName');
        const schemeType = tl.getEndpointAuthorizationSchemeRequired(serviceEndpointID);
        switch(schemeType.toLocaleLowerCase())
        {
            case 'none':
                tl.debug('Using auth-scheme-none and System.AccessToken.');
                const accessToken = tl.getVariable("System.AccessToken")!;
                authHandler = adoApi.getHandlerFromToken(accessToken);
                break;
            case 'basic':
                tl.debug('Using auth-scheme-basic.');
                const username = tl.getEndpointAuthorizationParameterRequired(serviceEndpointID, 'username');
                const password = tl.getEndpointAuthorizationParameterRequired(serviceEndpointID, 'username');
                authHandler = adoApi.getBasicHandler(username, password);
                break;
            case 'token':
                tl.debug('Using auth-scheme-token, PAT.');
                const pat = tl.getEndpointAuthorizationParameterRequired(serviceEndpointID, 'apitoken');
                authHandler = adoApi.getPersonalAccessTokenHandler(pat);
                break;
            default:
                tl.error(`Unknow scheme-type provided: ${schemeType}, abording.`)
                tl.setResult(tl.TaskResult.Failed, "Authentification information not provided.", true);
                return;
        }

        const vsts: adoApi.WebApi = new adoApi.WebApi(baseURI, authHandler);
        let vstsAuthUser: idtInterface.Identity;
        vsts.connect()
            .then((connectionData) => {
                vstsAuthUser = connectionData.authenticatedUser!;
                tl.debug(`Working as: ${connectionData.authenticatedUser?.providerDisplayName} | ${connectionData.authenticatedUser?.id}`)
            })
            .catch((connectionError) => {
                tl.error(`While trying to connect to ${baseURI}, using ${schemeType} see: ${connectionError}`);
                tl.setResult(tl.TaskResult.Failed, "Authentification information not provided.", true);
                return;
            });        

        const vstsGitApi = await vsts.getGitApi();

        console.debug(`projectId[${typeof(projectId)}]: ${projectId}, repositoryId[${typeof(repositoryId)}]: ${repositoryId}, pullRequestId [${typeof(pullRequestId)}]: ${pullRequestId}`)

        let pullRequest = await vstsGitApi.getPullRequestById(pullRequestId, projectId); 
        console.debug(`PR loaded: ${pullRequest.pullRequestId}`);
        if(pullRequest.isDraft 
            || pullRequest.status == GitInterfaces.PullRequestStatus.Abandoned 
            || pullRequest.status == GitInterfaces.PullRequestStatus.Completed
        ){
            tl.setResult(tl.TaskResult.Failed, `This task won't comment over a draft or Completed/Abandoned PullRequests.`, true);
        }

        //TODO: check if the iteration link to the commit is the first instead of counting it using sourceRefCommit.CommitId
        // ITERATIONS
        /// Get all iterations
        const iterations = await vstsGitApi.getPullRequestIterations(repositoryId, pullRequestId, projectId, false); 
        /// Find iteration related to this commit
        const currentIterationScope = iterations.find((iteration) => {
            return iteration.sourceRefCommit?.commitId === reviewedCommitId;
        })!;
        /// Get all iterations from start to {now}
        const workingScopeOfIterations = iterations.slice(0, iterations.indexOf(currentIterationScope)+1);
        /// Get all changes related to our  start to {now}'s iterations, allowing to map file to a GitPullRequestCommentThread.PullRequestThreadContext afterwise
        const workingScopeOfIterationWithChanges = await Promise.all(
            workingScopeOfIterations.map(async (iteration): Promise<IIterationContainer> => ({
                IterationId: iteration.id!,
                IterationChanges: await vstsGitApi.getPullRequestIterationChanges(repositoryId, pullRequestId, iteration.id!, projectId, undefined, undefined,  iteration.id!-1)
            }))
        );

        interface IIterationContainer {
            IterationId: number,
            IterationChanges: GitInterfaces.GitPullRequestIterationChanges
        }

        function findLatestChangeFor(localFilePath:string): { IterationId: number | undefined; IterationChange: GitInterfaces.GitPullRequestChange | undefined } {
            for (let i = workingScopeOfIterationWithChanges.length - 1; i >= 0; i--) {
                const iteration = workingScopeOfIterationWithChanges[i];
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

        // COMMENTS
        /// Load existing one in current context
        const commentThreads: readonly GitInterfaces.GitPullRequestCommentThread[]= await vstsGitApi.getThreads(repositoryId, pullRequestId, projectId, currentIterationScope.id, 1);
        let commentThreadsToKeep: number[] = [];
        let promises: Promise<any>[] = [];
        for await (const documentWithProblem of reportGroupedByFiles){
            const relatedChangeEntry = findLatestChangeFor(documentWithProblem.FileRef.FileRelativePath);
            if(relatedChangeEntry.IterationId == undefined || relatedChangeEntry.IterationChange == undefined){
                tl.warning(`Failed to find origin iteration change for ${documentWithProblem.FileRef.FileLocalPath}, resolved as: ${documentWithProblem.FileRef.FileRelativePath} over iterations:${workingScopeOfIterations.map((i) => {return i.id}).join(',')}`);
                continue;
            }

            // Grouped comments in 1 thread on top of files, updated at each scan until closed to avoid spam
            if(documentWithProblem.GroupedDiagnostics.filter(x => x.Count >= 5).length > 0){
                const existingCommentForProblem = commentThreads.find((thread) => {
                    return thread.threadContext?.filePath == documentWithProblem.FileRef.FileRelativePath 
                        && thread.comments?.[0].author?.id == vstsAuthUser.id
                        && thread.isDeleted == false
                        && thread.comments?.[0].content?.startsWith('This file contains too much warnings, sum-up')
                        && (thread.threadContext?.rightFileStart?.line == 1 && thread.threadContext?.rightFileStart?.offset == 1 
                            || thread.threadContext?.leftFileStart?.line == 1 && thread.threadContext?.leftFileStart?.offset == 1 )
                });

                if(existingCommentForProblem){
                    if(existingCommentForProblem.status == GitInterfaces.CommentThreadStatus.Closed 
                        || existingCommentForProblem.status == GitInterfaces.CommentThreadStatus.Fixed
                        )
                    { // re-open issue if sonmeone tought to close it
                        promises.push(vstsGitApi.updateThread(
                            {
                                status: GitInterfaces.CommentThreadStatus.Active
                            },
                            repositoryId,
                            pullRequestId,
                            existingCommentForProblem.id!,
                            projectId
                            ));
                        promises.push(vstsGitApi.createComment(
                            {
                                commentType: GitInterfaces.CommentType.Text,
                                content: "Re-opening issue as not fixed as stated." ,
                                parentCommentId: existingCommentForProblem.comments?.at(0)?.id
                            },
                            repositoryId,
                            pullRequestId,
                            existingCommentForProblem.id!,
                            projectId
                            ));                            
                    } else { // update issue with latest stats
                        let commentContent: string = commentHelper.getThreadCommentForMultipleDiagnostics(extensionContext, documentWithProblem);

                        // only update if the content is diff. 
                        if(commentContent != existingCommentForProblem.comments?.at(0)?.content){
                            promises.push(vstsGitApi.updateComment(
                                {
                                    content: commentContent
                                },
                                repositoryId,
                                pullRequestId,
                                existingCommentForProblem.id!,
                                1,
                                projectId
                                ));
                            promises.push(vstsGitApi.createComment(
                                {
                                    commentType: GitInterfaces.CommentType.Text,
                                    content: "Updated diagnostics." ,
                                    parentCommentId: existingCommentForProblem.comments?.at(0)?.id
                                },
                                repositoryId,
                                pullRequestId,
                                existingCommentForProblem.id!,
                                projectId
                                ));   
                        }                               
                    }
                    commentThreadsToKeep.push(existingCommentForProblem.id!);                   
                } 
                else { // don't exist, add new comment
                    let commentContent: string = commentHelper.getThreadCommentForMultipleDiagnostics(extensionContext, documentWithProblem);

                    let threadContext: GitInterfaces.CommentThreadContext;
                    if(relatedChangeEntry.IterationChange.changeType == GitInterfaces.VersionControlChangeType.Edit){
                        threadContext = {
                            filePath: documentWithProblem.FileRef.FileRelativePath,                            
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
                            filePath: documentWithProblem.FileRef.FileRelativePath,                            
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
                                changeTrackingId: relatedChangeEntry.IterationChange.changeTrackingId,
                                iterationContext: {
                                    firstComparingIteration: currentIterationScope.id,
                                    secondComparingIteration: currentIterationScope.id
                                }
                            }
                    };
                    promises.push(vstsGitApi.createThread(threadToAdd, repositoryId, pullRequestId, projectId));
                } 
            }
            
            tl.debug('Working on less spamming part');
            for await (const diagnostic of documentWithProblem.GroupedDiagnostics.filter(x => x.Count < 5)){
                if(diagnostic.SeverityLevel < minSeverityLevel) {
                    tl.debug(`Min. severity not reached for ${diagnostic.DiagnosticId} at ${diagnostic.SeverityLevel}.`);
                    continue;
                }

                if(ignoredDiagnosticIds.some((ignoredId) => ignoredId.toUpperCase() === diagnostic.DiagnosticId)){
                    tl.debug(`Diagnostic ${diagnostic.DiagnosticId} ignored.`);
                    continue;
                }

                tl.debug(`Working on ${diagnostic.DiagnosticId}`);
                console.dir(documentWithProblem.GroupedDiagnostics.filter(x => x.DiagnosticId === diagnostic.DiagnosticId), { depth: 5});
                //TODO: find fixed comment and auto-close them.
                for await (const problem of documentWithProblem.GroupedDiagnostics.filter(x => x.DiagnosticId === diagnostic.DiagnosticId).at(0)!.FileChanges){                
                    const existingCommentForProblem = commentThreads.find((thread) => {
                        return thread.threadContext?.filePath == documentWithProblem.FileRef.FileRelativePath 
                            && thread.comments?.[0].author?.id == vstsAuthUser.id
                            && thread.isDeleted == false
                            && thread.comments?.[0].content == problem.FormatDescription
                            //TODO: check what happen for generic diagnostic? (those without specfic identification of token like WHITESPACE)
                            // && (thread.threadContext?.rightFileStart?.line == problem.LineNumber && thread.threadContext?.rightFileStart?.offset == problem.CharNumber 
                            //     || thread.threadContext?.leftFileStart?.line == problem.LineNumber && thread.threadContext?.leftFileStart?.offset == problem.CharNumber)
                    });

                    tl.debug(`Working on ${problem.DiagnosticId} at ${problem.LineNumber}`);
                    tl.debug(`Found to be existing: ${existingCommentForProblem?.id}`);

                    if(existingCommentForProblem){
                        if(existingCommentForProblem.status == GitInterfaces.CommentThreadStatus.Closed 
                            || existingCommentForProblem.status == GitInterfaces.CommentThreadStatus.Fixed
                            )
                        {
                                promises.push(vstsGitApi.updateThread(
                                    {
                                        status: GitInterfaces.CommentThreadStatus.Active
                                    },
                                    repositoryId,
                                    pullRequestId,
                                    existingCommentForProblem.id!,
                                    projectId
                                    ));
                                promises.push(vstsGitApi.createComment(
                                    {
                                        commentType: GitInterfaces.CommentType.Text,
                                        content: "Re-opening issue as not fixed as stated, use `Won't fix` status for cases not valuable.",
                                        parentCommentId: existingCommentForProblem.comments?.at(0)?.id
                                    },
                                    repositoryId,
                                    pullRequestId,
                                    existingCommentForProblem.id!,
                                    projectId
                                    ));                                
                        }
                        commentThreadsToKeep.push(existingCommentForProblem.id!);                   
                    } 
                    else { // don't exist, add new comment
                        let threadContext: GitInterfaces.CommentThreadContext;
                        if(relatedChangeEntry.IterationChange.changeType == GitInterfaces.VersionControlChangeType.Edit){
                            threadContext = {
                                filePath: documentWithProblem.FileRef.FileRelativePath,                            
                                rightFileStart: {
                                    line: problem.LineNumber,
                                    offset: problem.CharNumber
                                },
                                rightFileEnd: {
                                    line: problem.LineNumber,
                                    offset: problem.CharNumber
                                }
                            };
                        } else {
                            threadContext = {
                                filePath: documentWithProblem.FileRef.FileRelativePath,                            
                                leftFileStart: {
                                    line: problem.LineNumber,
                                    offset: problem.CharNumber
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
                                        content: problem.FormatDescription
                                    }
                                ],
                                status: GitInterfaces.CommentThreadStatus.Active,
                                isDeleted: false,
                                threadContext: threadContext,
                                pullRequestThreadContext: {
                                    changeTrackingId: relatedChangeEntry.IterationChange.changeTrackingId,
                                    iterationContext: {
                                        firstComparingIteration: currentIterationScope.id,
                                        secondComparingIteration: currentIterationScope.id
                                    }
                                }
                        };
                        promises.push(vstsGitApi.createThread(threadToAdd, repositoryId, pullRequestId, projectId));
                    }                    
                }
            }
        }

        // Close any non touched comment, created by same previous identity.
        // TODO: add option
        const commentThreadToClose = commentThreads.filter(
            x => commentThreadsToKeep.indexOf(x.id!) === -1 
            && x.comments?.[0].author?.id == vstsAuthUser.id
            && x.status == GitInterfaces.CommentThreadStatus.Active
            && x.isDeleted == false
            );
        tl.debug(`Existing: ${commentThreads.map(x => x.id).join(',')}`);
        tl.debug(`Touched: ${commentThreadsToKeep.join(',')}`);
        tl.debug(`To be closed: ${commentThreadToClose.map(x => x.id).join(',')}`);
        for await (const commentThread of commentThreadToClose){

            try {
                await vstsGitApi.createComment(
                    {
                        commentType: GitInterfaces.CommentType.Text,
                        content: "Closing thread as seem to be fixed." ,
                        parentCommentId: commentThread.comments?.at(0)?.id
                    },
                    repositoryId,
                    pullRequestId,
                    commentThread.id!,
                    projectId
                );

                await vstsGitApi.updateThread(
                    {
                        status: GitInterfaces.CommentThreadStatus.Fixed
                    },
                    repositoryId,
                    pullRequestId,
                    commentThread.id!,
                    projectId
                );
            } catch (error) {
                tl.error(`Error while commenting & closing (resolved) comment-thread ${commentThread.id} for PR:${pullRequestId} over ${commentThread.threadContext?.filePath}, see: ${error}`);
            }
        }
        
        //TODO move to queue with leaking-bucket alike to avoid API limitation
        Promise.all(promises)
            .then((results) => {
                tl.setResult(tl.TaskResult.Succeeded, `${results.length} comment(s) added/updates/closed.`, true);
            })
            .catch((error) => {
                tl.setResult(tl.TaskResult.Failed, error, true);
            });        
    }
    catch (error: any) {
        tl.setResult(tl.TaskResult.Failed, error.message, true);
    }
}
run();