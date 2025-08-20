import ct = require('../common/context');
import { Constants } from '../common/constants';
import provider = require('./ProdiverInterfaces');
import util = require('node:util');
import tl = require('azure-pipelines-task-lib/task');
import adoApi = require('azure-devops-node-api');
import gitApi = require('azure-devops-node-api/GitApi');
const mm = require('micromatch');


export class AdoGitApiDiffProvider implements provider.IDiffProvider {
    private readonly isDebug: boolean;
    private readonly baseUrl: string;
    private readonly accessToken: string;
    private readonly pullRequestId: number;
    private readonly repositoryId: string;
    private readonly projectId: string;
    private readonly commitId: string;

    constructor(ctx: Readonly<ct.IExtensionContext>){
        this.isDebug = ctx.Environment.IsDebug;
        this.baseUrl = ctx.Environment.CollectionUri;
        this.accessToken = tl.getVariable(Constants.VarAccessToken)!; // Get it here to not force everyone to provide it.
        this.pullRequestId = ctx.Environment.PullRequestId;
        this.repositoryId = ctx.Environment.RepositoryId;
        this.projectId = ctx.Environment.ProjectId;
        this.commitId = ctx.Environment.ReviewedCommitId;     
    }

    public async getChangeFor(filePatterns: ReadonlyArray<string>): Promise<string[]> {
        const authHandler = adoApi.getHandlerFromToken(this.accessToken);
        const vsts: adoApi.WebApi = new adoApi.WebApi(this.baseUrl, authHandler);

        try {
            const connectionData = await vsts.connect();
            if(connectionData.authenticatedUser === undefined){
                throw new Error('Authentication information can\'t be read.');
            }
            tl.debug(`Working as: ${connectionData.authenticatedUser.providerDisplayName} | ${connectionData.authenticatedUser.id}`);
        } catch (error) {
            tl.error(`While trying to connect to ${this.baseUrl}, using AccessToken see: ${error}`);
            throw new Error('Authentication information not provided.');
        }
        
        const adoGitApi: gitApi.IGitApi = await vsts.getGitApi();
        const pullRequestIterations = await adoGitApi.getPullRequestIterations(this.repositoryId, this.pullRequestId, this.projectId);

        /// Find iteration related to this commit
        const currentIterationScope = pullRequestIterations.find((iteration) => {
            return iteration.sourceRefCommit?.commitId === this.commitId;
        })!;

        const changes = await adoGitApi.getPullRequestIterationChanges(
            this.repositoryId,
            this.pullRequestId,
            currentIterationScope.id!,
            this.projectId,
            undefined,
            undefined,
            0
        );
        
        const files = changes.changeEntries!
            .filter(change => {
                // Some ChangeType aren't related to file path.
                if(change.item!.path == null)
                    return false;

                const filePath = change.item!.path!;
                let result = mm.isMatch(filePath, filePatterns, {matchBase: true, debug: this.isDebug});
                tl.debug(`File: ${filePath} | Match: ${result}`);
                return result;
            })
            .map((change) => {
                return change.item!.path!;
            })

        if(this.isDebug){
            tl.debug(`From iteration 0 to ${currentIterationScope.id}: ${changes.changeEntries?.length} changes.`);
            tl.debug(`Patterns: ${util.inspect(filePatterns)}`);
            tl.debug(`Files impacted: ${files}`);
        }

        return files;
    }
}