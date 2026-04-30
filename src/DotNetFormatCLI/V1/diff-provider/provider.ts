import * as ct from '../common/context';
import * as provider from './ProdiverInterfaces';
import * as adoGitApiProvider from './ado-git-api';
import * as gitGitNativeProvider from './ado-git-native';

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