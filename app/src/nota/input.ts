import { t } from '../i18n';
import {formatOf,sourceFormatForFile,type DocFormatId} from '../editor/formats';
import {isProjectFile} from '../common/filetypes';
import {sniffDialect} from '../pu';
import {unpackProject,type ProjectSnapshot} from '../editor/omrproject';
import {JpwFile} from '../jpword/jpwfile';
import {jpwToScoreDoc} from '../model/fromjpw';

/** Parse with the same native adapters before an input can clear the current document or OMR session. */
export function prepareDocumentInput(bytes:Uint8Array,name:string):{format:DocFormatId;text:string;project?:ProjectSnapshot} {
  if(isProjectFile(name)) {
    let project:ProjectSnapshot;
    try {project=unpackProject(bytes);} catch {throw new Error(t("nota.ia.thisRecognitionProjectCannotBe"));}
    validate(project.docFormat,project.text);
    return {format:project.docFormat,text:project.text,project};
  }
  const format=sourceFormatForFile(name);
  const text=formatOf(format).decode(bytes);
  validate(format,text);
  return {format,text};
}
function validate(format:DocFormatId,text:string):void {
  if(!text.trim()) throw new Error(t("nota.ia.theFileContainsNoScore"));
  if(format === 'pu' && !sniffDialect(text).dialect) throw new Error(t("nota.ia.theTextIsNotA"));
  const adapter=formatOf(format);
  if(adapter.toScoreDoc) {
    const doc=adapter.toScoreDoc(text);
    const rejected=adapter.reloadSpec.reject(doc);
    if(rejected || !doc.songs.length) throw new Error(rejected || t("nota.ia.noScoreWasFoundThe"));
  } else {
    const file=JpwFile.fromString(text);
    if(!file || !jpwToScoreDoc(file).songs.length) throw new Error(t("nota.ia.theFileIsNotA"));
  }
}
