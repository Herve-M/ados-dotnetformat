import tl = require('azure-pipelines-task-lib/task');
import https = require('https');
import ct = require('./common/context');

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

    const options = {
        hostname: "statistics.nherve.dev",
        path: "/api/event",
        method: "POST",
        headers: {
            "User-Agent": `${extensionContext.Task.GetUserAgent()} {os.toString()}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data)
        }
    };

    // Telemetry
    const req = https.request(options, (res) => {

        let body = "";
        res.on("data", (chunk) => {
            body += chunk;
        });
        res.on("end", () => {
            console.log(body);
        });
    });

    req.write(data);
    req.end();    
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