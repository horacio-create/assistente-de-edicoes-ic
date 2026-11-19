// Pasta dos dados gravados em disco (backups, entregas, capturas, referências).
// Dentro do Assistente de Edições ela vem de CARTELAS_DATA; sozinho, o Cartelas usa a própria pasta.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const dataRoot=process.env.CARTELAS_DATA?path.resolve(process.env.CARTELAS_DATA):path.dirname(fileURLToPath(import.meta.url));
