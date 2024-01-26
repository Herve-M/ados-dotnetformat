import provider = require('./ProdiverInterfaces');
import adoGitApiProvider = require('./ado-git-api');
import gitGitNativeProvider = require('./ado-git-native');
import tl = require("azure-pipelines-task-lib/task");

export class DiffProviderFactory {
    public static create(): provider.IDiffProvider {
        const providerType = tl.getInput('diffProvider', true);
        const repositoryProvider = tl.getVariable('Build.Repository.Provider')!;

        switch(repositoryProvider){
            case 'TfsGit':
                if(providerType === 'native'){
                    return new gitGitNativeProvider.AdoGitNativeDiffProvider();
                } 
                return new adoGitApiProvider.AdoGitApiDiffProvider();
            default:
                throw new Error(`Diff. provider for ${repositoryProvider} is not supported.`);
        }
    }
}