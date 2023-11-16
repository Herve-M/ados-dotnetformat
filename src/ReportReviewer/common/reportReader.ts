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


export interface IReport {
  DocumentRef: {
    ProjectId: string;
    DocumentId: string;
  };
  FileRef: {
    FileName: string;
    FileLocalPath: string;
    FileRelativePath: string;
  }
  FileChanges: {
    LineNumber: number;
    CharNumber: number;
    DiagnosticId: string;
    FormatDescription: string;
  }[];
}

//TODO
// - Find/Create report mixing analyzer and style and whitespace
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