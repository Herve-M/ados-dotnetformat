import * as tl from 'azure-pipelines-task-lib/task';
import * as ct from './common/context';

async function run() {
    // Get context
    const extensionContext = await ct.getExtensionContext(tl.resolve(__dirname));
    
    if(extensionContext.Environment.TelemetryOptout){
        return;
    }

    // Telemetry data
    const os = tl.getPlatform();
    const agentVersion = tl.getVariable('Agent.Version')!;
    const agentHostMode = tl.getAgentMode();
    const nodeHostVersion = tl.getNodeMajorVersion();

    const data = JSON.stringify({
        name: "run",
        url: extensionContext.Environment.CollectionUri,
        domain: "ados-dotnetformat",
        props: {
            "os": os.toString(),
            "taskVersion": extensionContext.Task.Version,
            "agentVersion": agentVersion,
            "nodeVersion": nodeHostVersion,
            "agentHostMode": agentHostMode.toString(),
        }
    });

    // Telemetry
    await fetch('https://statistics.nherve.dev/api/event', {
        method: 'POST',
        headers: {
            'User-Agent': `${extensionContext.Task.GetUserAgent()} ${os.toString()}`,
            'Content-Type': 'application/json'
        },
        body: data
    });
}

void run()
    .catch((error: unknown) => {
        if(tl.getVariable('System.Debug') === 'True'){
            console.error(error);
        }
    })
    .finally(() => {
        tl.setResult(tl.TaskResult.Succeeded, undefined, true);
    });