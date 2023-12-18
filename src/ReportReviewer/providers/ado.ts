import tl = require('azure-pipelines-task-lib/task');
import adoApi = require('azure-devops-node-api');
import vsoInterface = require('azure-devops-node-api/interfaces/common/VsoBaseInterfaces');
import idtInterface = require('azure-devops-node-api/interfaces/IdentitiesInterfaces');
import GitInterfaces = require('azure-devops-node-api/interfaces/GitInterfaces');
import ReportInterfaces = require('../common/reportReader')
import CommonInterfaces = require('../common/comments')

export async function CreateOrReOpenCommentForProblem(
        context: CommonInterfaces.ICommentContext,
        file: Readonly<string>,
        problem: ReportInterfaces.IFileProblem
    ): Promise<Promise<any>>
{
    const existingCommentForProblem = context.ExistingThreads.find((thread) => {
        return thread.threadContext?.filePath == file
            && thread.comments?.[0].author?.id == context.AuthUserId
            && thread.comments?.[0].content == problem.FormatDescription
            && thread.threadContext?.rightFileStart?.line == problem.LineNumber
            && thread.threadContext?.rightFileStart?.offset == problem.CharNumber
    });

    if(existingCommentForProblem){
        if(existingCommentForProblem.status == GitInterfaces.CommentThreadStatus.Closed 
            || existingCommentForProblem.status == GitInterfaces.CommentThreadStatus.Fixed
            )
        {
            return Promise.resolve(
                context.ApiClient.updateThread(
                    {
                        status: GitInterfaces.CommentThreadStatus.Active
                    },
                    context.RepositoryId,
                    context.PullRequestId,
                    existingCommentForProblem.id!,
                    context.ProjectId
                    )
                )
                .then((commentThread) => {
                    return context.ApiClient.createComment(
                        {
                            commentType: GitInterfaces.CommentType.Text,
                            content: "Re-opening issue as not fixed as stated, use `Won't fix` status for cases not valuable.",
                            parentCommentId: existingCommentForProblem.comments?.at(0)?.id
                        },
                        context.RepositoryId,
                        context.PullRequestId,
                        commentThread.id!,
                        context.ProjectId
                        );
                })
                .catch((err) => {
                    tl.error(`Error while updating & re-opening comment-thread ${existingCommentForProblem.id} for PR:${context.PullRequestId} for ${file} over ${problem.DiagnosticId}, see: ${err}`);
                });
        } else {
            tl.debug(`Comment already existing with "Won't fix" status for PR:${context.PullRequestId} for ${file} over ${problem.DiagnosticId}`);
        }     
    } 
    else { // don't exist, add new comment
        const threadToAdd: GitInterfaces.GitPullRequestCommentThread = {
                comments: [
                    {
                        parentCommentId: 0, 
                        commentType: GitInterfaces.CommentType.Text,
                        content: problem.FormatDescription
                    }
                ],
                status: GitInterfaces.CommentThreadStatus.Active,
                isDeleted: false,
                threadContext: {
                    filePath: file,
                    rightFileStart: {
                        line: problem.LineNumber,
                        offset: problem.CharNumber
                    }
                },
                // pullRequestThreadContext: {
                //     changeTrackingId: relatedChangeEntry.IterationChange.changeTrackingId,
                //     iterationContext: {
                //         firstComparingIteration: currentIterationScope.id,
                //         secondComparingIteration: currentIterationScope.id
                //     }
                // }
        };
        return context.ApiClient.createThread(threadToAdd, context.RepositoryId, context.PullRequestId, context.ProjectId);
    } 
    
    return; 
}

export async function CreateOrUpdateSummaryCommentForFile(
    context: CommonInterfaces.ICommentContext,
    problems: ReportInterfaces.IGroupedReport
    ): Promise<void>
{
    
    
    
    return; 
}