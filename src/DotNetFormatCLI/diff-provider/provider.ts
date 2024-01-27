import ct = require('../common/context');
import provider = require('./ProdiverInterfaces');
import adoGitApiProvider = require('./ado-git-api');
import gitGitNativeProvider = require('./ado-git-native');
import tl = require("azure-pipelines-task-lib/task");

export class DiffProviderFactory {
    public static create(ctx: Readonly<ct.IExtensionContext>): provider.IDiffProvider {
        const providerType = ctx.Settings.DiffProvider;

        switch(ctx.Environment.ScmType){
            case 'TfsGit':
                if(providerType === 'native'){
                    return new gitGitNativeProvider.AdoGitNativeDiffProvider(ctx);
                } 
                return new adoGitApiProvider.AdoGitApiDiffProvider(ctx);
            default:
                throw new Error(`Diff. provider for ${ctx.Environment.ScmType} is not supported.`);
        }
    }
}