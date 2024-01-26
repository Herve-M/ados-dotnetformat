import provider = require('./ProdiverInterfaces');
import tl = require("azure-pipelines-task-lib/task");
import adoApi = require('azure-devops-node-api');
import gitApi = require('azure-devops-node-api/GitApi');
import minimatch = require('minimatch');

export class AdoGitApiDiffProvider implements provider.IDiffProvider {
    private readonly isDebug: boolean;
    private readonly baseUrl: string;
    private readonly accessToken: string;
    private readonly pullRequestId: number;
    private readonly repositoryId: string;
    private readonly projectId: string;
    private readonly commitId: string;

    constructor(){
        this.isDebug = tl.getVariable("System.Debug") == 'True';
        this.baseUrl = tl.getVariable('System.CollectionUri')!;
        this.accessToken = tl.getVariable('System.AccessToken')!;
        this.pullRequestId = Number(tl.getVariable('System.PullRequest.PullRequestId')!);
        this.repositoryId = tl.getVariable('Build.Repository.ID')!;
        this.projectId = tl.getVariable('System.TeamProjectId')!;
        this.commitId = tl.getVariable('System.PullRequest.SourceCommitId')!;

        tl.debug(`ProjectId[${typeof(this.projectId)}]: ${this.projectId}, RepositoryId[${typeof(this.repositoryId)}]: ${this.repositoryId}, PullRequestId [${typeof(this.pullRequestId)}]: ${this.pullRequestId}`);
    }

    public async getChangeFor(filePattern: Readonly<string>): Promise<string[]> {
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
        
        const files = changes.changeEntries!.map((change) => {
            return change.item!.path!;
        }).filter(minimatch.filter(filePattern, { matchBase: true}));

        if(this.isDebug){
            tl.debug(`From iteration 0 to ${currentIterationScope.id}: ${changes.changeEntries?.length} changes.`);
            // console.dir(changes.changeEntries, { depth: 5});
            tl.debug(`Files impacted: ${files}`);
        }        

        return files;
    }
}