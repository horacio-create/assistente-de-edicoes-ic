import {dataRoot} from './dados.mjs';
import path from 'node:path';import {fileURLToPath} from 'node:url';import {createBackupService} from './backups.mjs';import {validateLibrary} from './public/library.js';
export function createLibraryBackupService(directory=path.join(dataRoot,'Backups','bibliotecas')){return createBackupService({directory,validate:validateLibrary,describe:p=>({name:p.name,cardCount:0,clientCount:p.clients.length,templateCount:p.templates.length,collectionCount:p.collections.length})});}
export const libraryBackupService=createLibraryBackupService();
