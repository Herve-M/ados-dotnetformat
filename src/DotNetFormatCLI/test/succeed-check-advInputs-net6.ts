import path = require('path');
import mtr = require('azure-pipelines-task-lib/mock-toolrunner')
import ma = require('azure-pipelines-task-lib/mock-answer');
import tmrm = require('azure-pipelines-task-lib/mock-run');

const taskPath = path.join(__dirname, '..', 'dotnetformat.js');
const  tmr: tmrm.TaskMockRunner = new tmrm.TaskMockRunner(taskPath);

tmr.setInput('useGlobalToolOption', 'False');
tmr.setInput('command', 'check');
tmr.setInput('severityOption', 'error');
tmr.setInput('workspaceOption', '/src/tests/dotnet6/');
tmr.setInput('includeOptions', 'program.cs\nprogram.net6.cs');
tmr.setInput('excludeOptions', 'toexclude.cs');
tmr.setInput('onlyChangedFiles', '');
tmr.setInput('noRestoreOption', 'True');
tmr.setInput('includeGeneratedOption', 'True');
tmr.setInput('diagnosticsOptions', 'IDE01,IDE02');
tmr.setInput('diagnosticsExcludedOptions', 'CS0168');
tmr.setInput('verbosityOption', 'Quiet');

// .NET 6
tmr.registerMock('azure-pipelines-task-lib/toolrunner', mtr);
const a: ma.TaskLibAnswers = <ma.TaskLibAnswers>{
    "which": { 
        "dotnet": "c:\\path\\dotnet.exe"
    },
    "checkPath": { 
        "c:\\path\\dotnet.exe": true
    },
    "exec": {
        "c:\\path\\dotnet.exe format /src/tests/dotnet6/ --include @c:\\agent_work\\1\\s\\Included.rsp --exclude @c:\\agent_work\\1\\s\\Excluded.rsp --severity error --no-restore --include-generated --diagnostics IDE01 IDE02 --exclude-diagnostics CS0168 --verbosity quiet --verify-no-changes --report c:/agent_work/1/a/CodeAnalysisLogs/format.json": {
            "code": 0,
            "stdout": "OK",
            "stderr": ""
        }
    }
}
tmr.setAnswers(a);

tmr.run();
