import * as os from 'node:os';
import * as ct from './common/context';
import * as tl from 'azure-pipelines-task-lib/task';

export async function writeRspFile(ctx: Readonly<ct.IExtensionContext>, filePath: Readonly<string>, content: ReadonlyArray<string>){
    tl.writeFile(filePath, content.join(os.EOL));
    
    if(ctx.Environment.IsDebug){
        tl.debug(`RSP file written at ${filePath} with ${content.length} lines, as:`);
        console.dir(content);
    }
}