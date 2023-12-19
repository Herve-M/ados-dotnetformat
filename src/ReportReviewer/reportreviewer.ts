import tl = require('azure-pipelines-task-lib/task');
import GitInterfaces = require('azure-devops-node-api/interfaces/GitInterfaces');
import ct = require('./common/context');
import rr = require('./common/reportReader')
import commentHelper = require('./common/comments')
import adoProvider = require('./providers/ado');

async function run() {
    try {        
        const isPullRequest = tl.getVariable(ct.Constants.VarBuildReason)! == "PullRequest";
        if(!isPullRequest){
            tl.setResult(tl.TaskResult.Failed, "This task can't work outside of PullRequests.", true);
            return;
        }

        const provider = tl.getVariable(ct.Constants.VarRepositoryProvider)!;
        if(!provider.startsWith('Tfs')){
            tl.setResult(tl.TaskResult.Failed, "This task only work for Azure DevOps Service.", true);
            return;
        }

        // Get context
        const extensionContext = await ct.getExtensionContext();     

        // Load report.json file
        const reportGroupedByFiles = await rr.getGroupedReport(extensionContext);
        if(reportGroupedByFiles.length === 0){
            tl.setResult(tl.TaskResult.Succeeded, "Nothing to do.", true);
            return;
        }

        // ADO-API
        const vstsAuthUser = extensionContext.ApiContext.AuthIdentity;
        const pullRequest = await adoProvider.GetPullRequest(extensionContext); 

        //TODO: check if the iteration link to the commit is the first instead of counting it using sourceRefCommit.CommitId
        // ITERATIONS
        /// Get all iterations
        const iterations = await adoProvider.GetPullRequestIterations(extensionContext); 
        /// Find iteration related to this commit
        const currentIterationScope = iterations.find((iteration) => {
            return iteration.sourceRefCommit?.commitId === extensionContext.Environment.WorkingCommitId;
        })!;
        /// Get all iterations from start to {now}
        const workingScopeOfIterations = iterations.slice(0, iterations.indexOf(currentIterationScope)+1);
        /// Get all changes related to our  start to {now}'s iterations, allowing to map file to a GitPullRequestCommentThread.PullRequestThreadContext afterwise
        const workingScopeOfIterationWithChanges = await Promise.all(
            workingScopeOfIterations.map(async (iteration): Promise<adoProvider.IIterationContainer> => ({
                IterationId: iteration.id!,
                IterationChanges: await adoProvider.GetPullRequestIterationChanges(extensionContext, iteration.id!)
            }))
        );

        // COMMENTS
        /// Load existing one in current context
        const commentThreads: readonly GitInterfaces.GitPullRequestCommentThread[]= await adoProvider.GetThreads(extensionContext, currentIterationScope.id!, 1);
        let commentThreadsToKeep: number[] = [];
        let promises: Promise<any>[] = [];
        for await (const documentWithProblem of reportGroupedByFiles){
            const relatedChangeEntry = adoProvider.findLatestChangeFor(workingScopeOfIterationWithChanges, documentWithProblem.FileRef.FileRelativePath);
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
                        promises.push(adoProvider.UpdateThreadStatus(extensionContext, existingCommentForProblem.id!, GitInterfaces.CommentThreadStatus.Active));
                        promises.push(adoProvider.CreateComment(
                                extensionContext,
                                existingCommentForProblem.id!,
                                {
                                    commentType: GitInterfaces.CommentType.Text,
                                    content: "Re-opening issue as not fixed as stated." ,
                                    parentCommentId: existingCommentForProblem.comments?.at(0)?.id
                                }
                            )
                        );                            
                    } else { // update issue with latest stats
                        const commentContent: string = commentHelper.getThreadCommentForMultipleDiagnostics(extensionContext, documentWithProblem);
                        
                        // only update if the content is diff. 
                        if(commentContent != existingCommentForProblem.comments?.at(0)?.content){
                            promises.push(adoProvider.UpdateCommentContent(
                                extensionContext,
                                existingCommentForProblem.id!,
                                1,
                                commentContent
                            )); 
                            promises.push(adoProvider.CreateComment(
                                    extensionContext,
                                    existingCommentForProblem.id!,
                                    {
                                        commentType: GitInterfaces.CommentType.Text,
                                        content: "Updated diagnostics." ,
                                        parentCommentId: existingCommentForProblem.comments?.at(0)?.id
                                    },
                                )
                            );       
                        }                               
                    }
                    commentThreadsToKeep.push(existingCommentForProblem.id!);                   
                } 
                else { // don't exist, add new comment
                    let commentContent: string = commentHelper.getThreadCommentForMultipleDiagnostics(extensionContext, documentWithProblem);
                    promises.push(
                        adoProvider.CreateThreadForMultipleDiagnostics(extensionContext, documentWithProblem.FileRef.FileRelativePath, relatedChangeEntry, commentContent, currentIterationScope.id!)
                        );
                } 
            }
            
            for await (const diagnostic of documentWithProblem.GroupedDiagnostics.filter(x => x.Count < 5)){
                if(diagnostic.SeverityLevel < extensionContext.Settings.MinSeverityLevel) {
                    tl.debug(`Min. severity not reached for ${diagnostic.DiagnosticId} at ${diagnostic.SeverityLevel}.`);
                    continue;
                }

                if(extensionContext.Settings.IgnoredDiagnosticIds.some((ignoredId) => ignoredId.toUpperCase() === diagnostic.DiagnosticId)){
                    tl.debug(`Diagnostic ${diagnostic.DiagnosticId} ignored.`);
                    continue;
                }

                tl.debug(`Working on ${diagnostic.DiagnosticId}`);
                console.dir(documentWithProblem.GroupedDiagnostics.filter(x => x.DiagnosticId === diagnostic.DiagnosticId), { depth: 5});
                //TODO: try to find a way to count line diff. between comment CreatedCurrentIterationId and CurrentIterationId to improve selection?
                for await (const problem of documentWithProblem.GroupedDiagnostics.filter(x => x.DiagnosticId === diagnostic.DiagnosticId).at(0)!.FileChanges){                
                    const existingCommentForProblem = commentThreads.find((thread) => {
                        return thread.threadContext?.filePath == documentWithProblem.FileRef.FileRelativePath 
                            && thread.comments?.[0].author?.id == vstsAuthUser.id
                            && thread.isDeleted == false
                            && thread.comments?.[0].content == problem.FormatDescription
                    });

                    tl.debug(`Working on ${problem.DiagnosticId} at ${problem.LineNumber}`);
                    tl.debug(`Found to be existing: ${existingCommentForProblem?.id}`);

                    if(existingCommentForProblem){
                        if(existingCommentForProblem.status == GitInterfaces.CommentThreadStatus.Closed 
                            || existingCommentForProblem.status == GitInterfaces.CommentThreadStatus.Fixed
                            )
                        {
                            promises.push(adoProvider.UpdateThreadStatus(extensionContext, existingCommentForProblem.id!, GitInterfaces.CommentThreadStatus.Active));
                            promises.push(adoProvider.CreateComment(
                                    extensionContext,
                                    existingCommentForProblem.id!,
                                    {
                                        commentType: GitInterfaces.CommentType.Text,
                                        content: "Re-opening issue as not fixed as stated, use `Won't fix` status for cases not valuable.",
                                        parentCommentId: existingCommentForProblem.comments?.at(0)?.id
                                    },
                                )
                            );
                        }
                        commentThreadsToKeep.push(existingCommentForProblem.id!);                   
                    } 
                    else { // don't exist, add new thread
                        promises.push(
                            adoProvider.CreateThreadForSingleDiagnostic(extensionContext, problem, documentWithProblem.FileRef.FileRelativePath, relatedChangeEntry, currentIterationScope.id!)
                            );
                    }                    
                }
            }
        }

        // Close any non touched comment, created by same previous identity.
        // TODO: add option
        //   or change stategy, deleted and re-create everything at each iteration/run
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
                await adoProvider.CreateComment(
                    extensionContext,
                    commentThread.id!,
                    {
                        commentType: GitInterfaces.CommentType.Text,
                        content: "Closing thread as seem to be fixed." ,
                        parentCommentId: commentThread.comments?.at(0)?.id
                    },
                );
                await adoProvider.UpdateThreadStatus(extensionContext, commentThread.id!, GitInterfaces.CommentThreadStatus.Fixed);
            } catch (error) {
                tl.error(`Error while commenting & closing (resolved) comment-thread ${commentThread.id} for PR:${pullRequest.pullRequestId} over ${commentThread.threadContext?.filePath}, see: ${error}`);
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