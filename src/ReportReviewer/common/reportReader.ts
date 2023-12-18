import fs = require('fs')
import path = require('path')

export const forTestingOnly = {
  readReport,
  importReport
}

interface IDotNetFormatNativeReport {
    DocumentId: {
      ProjectId: {
        Id: string;
      };
      Id: string;
    };
    FileName: string;
    FilePath: string;
    FileChanges: {
      LineNumber: number;
      CharNumber: number;
      DiagnosticId: string;
      FormatDescription: string;
    }[];
}

export enum SeverityLevel {
  Info = 0,
  Warning = 1,
  Error = 2,
}

export function mapInputToSeverityLevel(severityString: string): SeverityLevel {
  const lowerCaseSeverityString = severityString.toLowerCase();

  switch (lowerCaseSeverityString) {
    case 'error':
      return SeverityLevel.Error;
    case 'warning':
      return SeverityLevel.Warning;
    case 'info':
      return SeverityLevel.Info;
    default:
      // Handle unknown strings (e.g., default to Info)
      return SeverityLevel.Info;
  }
}

export interface IFileProblem {
  readonly LineNumber: number;
  readonly CharNumber: number;
  readonly DiagnosticId: string;
  readonly FormatDescription: string;
}

export interface IReport {
  DocumentRef: {
    readonly ProjectId: string;
    readonly DocumentId: string;
  };
  FileRef: {
    readonly FileName: string;
    readonly FileLocalPath: string;
    readonly FileRelativePath: string;
  }
  readonly FileChanges: IFileProblem[];
}

export interface IGroupedReport {
  readonly DocumentRef: {
    readonly ProjectId: string;
    readonly DocumentId: string;
  };
  readonly FileRef: {
    readonly FileName: string;
    readonly FileLocalPath: string;
    readonly FileRelativePath: string;
  };
  GroupedDiagnostics: {
    DiagnosticId: string;
    SeverityLevel: SeverityLevel;
    Count: number;
    FileChanges: IFileProblem[];
  }[];
  UniqueDiagnosticCount: number;
  TotalDiagnostics: number;
}

//TODO
// - (optional) Add left end for WHITESPACE, FINALNEWLINE, ?

async function readReport(reportFilePath: string): Promise<IDotNetFormatNativeReport[]> {
  return new Promise<IDotNetFormatNativeReport[]>(async (resolve, reject) =>{
      fs.readFile(reportFilePath, 'utf8', (err, data) => {
          if (err) {
            reject(err);
            console.debug(err);
            return;
          }
    
          try {
            const report = JSON.parse(data) as IDotNetFormatNativeReport[];
            resolve(report);
          } catch (parseError) {
            console.debug(parseError);
            reject(parseError);
          }
        });
  });
}

export async function importReport(reportFilePath: string, repositoryLocalPath: string): Promise<IReport[]> {
  return new Promise((resolve, reject) => {
    readReport(reportFilePath)
    .then((data) => {
      const toReturn = data.map((document) => <IReport>({
        DocumentRef: {
          ProjectId: document.DocumentId.ProjectId.Id,
          DocumentId: document.DocumentId.Id
        },
        FileRef: {
          FileName: document.FileName,
          FileLocalPath: document.FilePath,
          FileRelativePath: (document.FilePath.replace(repositoryLocalPath, '')).split(path.sep).join(path.posix.sep)
        },
        FileChanges: document.FileChanges
      }));
      resolve(toReturn);
    })
    .catch((error) => {
      reject(error);
    });
  });
}

export function groupReport(inputArray: IReport[]): IGroupedReport[] {
  const groupedData: { [key: string]: IGroupedReport } = {};

  inputArray.forEach((item) => {
    const { DocumentRef, FileRef, FileChanges } = item;

    const key = `${DocumentRef.ProjectId}_${DocumentRef.DocumentId}_${FileRef.FileName}`;

    if (!groupedData[key]) {
      groupedData[key] = {
        DocumentRef,
        FileRef,
        GroupedDiagnostics: [],
        UniqueDiagnosticCount: 0,
        TotalDiagnostics: 0,
      };
    }

    const groupedReport = groupedData[key];

    FileChanges.forEach((change) => {
      const { DiagnosticId, FormatDescription } = change;

      // Check if this DiagnosticId already exists in the grouped report
      const existingDiagnostic = groupedReport.GroupedDiagnostics.find(
        (diagnostic) => diagnostic.DiagnosticId === DiagnosticId
      );

      if (existingDiagnostic) {
        existingDiagnostic.Count++;
        existingDiagnostic.FileChanges.push(change);
      } else {
        // Add a new entry for this DiagnosticId
        groupedReport.GroupedDiagnostics.push({
          DiagnosticId,
          SeverityLevel: determineSeverity(DiagnosticId, FormatDescription),
          Count: 1,
          FileChanges: [change]
        });
        groupedReport.UniqueDiagnosticCount++;
      }

      groupedReport.TotalDiagnostics++;
    });
  });

  return Object.values(groupedData);
}

function determineSeverity(DiagnosticId: string, FormatDescription: string): SeverityLevel {
  if (DiagnosticId === 'WHITESPACE' || DiagnosticId === 'FINALNEWLINE') {
    return SeverityLevel.Error;
  }

  const lowerDescription = FormatDescription.toLowerCase();
  if (lowerDescription.startsWith('error')) {
    return SeverityLevel.Error;
  } else if (lowerDescription.startsWith('warning')) {
    return SeverityLevel.Warning;
  } else if (lowerDescription.startsWith('info')) {
    return SeverityLevel.Info;
  } else {
    // Default to Info if the FormatDescription doesn't match known levels
    return SeverityLevel.Info;
  }
}