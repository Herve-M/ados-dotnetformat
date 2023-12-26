import gitApi = require('azure-devops-node-api/GitApi');
import GitInterfaces = require('azure-devops-node-api/interfaces/GitInterfaces');
import rr = require('./reportReader')
import tl = require('azure-pipelines-task-lib/task');
import { IExtensionContext } from './context';

export interface ICommentContext {
    readonly ApiClient: gitApi.IGitApi, 
    readonly AuthUserId: string,
    readonly CollectionId: number,
    readonly ProjectId: string,
    readonly RepositoryId: string,
    readonly PullRequestId: number,
    readonly ExistingThreads: readonly GitInterfaces.GitPullRequestCommentThread[]
}

export function getThreadCommentForMultipleDiagnostics(
    ctx: Readonly<IExtensionContext>,
    document: Readonly<rr.IGroupedReport>,
    ): string {
    const commentIntro: string = 'This file contains too much warnings, sum-up:\n';
    let commentContent: string = '';
    for (const diagnostic of document.GroupedDiagnostics.filter(x => x.Count >= ctx.Settings.SpamThreshold).sort(function(a, b) { return  b.Count - a.Count; })){
        if(diagnostic.SeverityLevel < ctx.Settings.MinSeverityLevel) {
            tl.debug(`Min. severity not reached for ${diagnostic.DiagnosticId} at ${diagnostic.SeverityLevel}.`);
            continue;
        }

        if(ctx.Settings.IgnoredDiagnosticIds.some((ignoredId) => ignoredId.toUpperCase() === diagnostic.DiagnosticId)){
            tl.debug(`Diagnostic ${diagnostic.DiagnosticId} ignored.`);
            continue;
        }
        
        commentContent += `- ${diagnostic.Count}x ${diagnostic.DiagnosticId}\n`;
    }

    if(commentContent.length > 0) {
        commentContent = commentIntro + commentContent;
    }

    return commentContent;
}