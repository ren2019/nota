import {formatOf,type DocFormatId} from '../editor/formats';
import {is123File,isJcxFile,isJlyFile,isProjectFile,isPuFile} from '../common/filetypes';
import {sniffDialect} from '../pu';
import {unpackProject,type ProjectSnapshot} from '../editor/omrproject';
import {JpwFile} from '../jpword/jpwfile';
import {jpwToScoreDoc} from '../model/fromjpw';

/** Parse with the same native adapters before an input can clear the current document or OMR session. */
export function prepareDocumentInput(bytes:Uint8Array,name:string):{format:DocFormatId;text:string;project?:ProjectSnapshot} {
  if(isProjectFile(name)) {
    let project:ProjectSnapshot;
    try {project=unpackProject(bytes);} catch {throw new Error('这份识别项目无法打开，请检查原文件。');}
    validate(project.docFormat,project.text);
    return {format:project.docFormat,text:project.text,project};
  }
  const format:DocFormatId=/\.abc$/i.test(name) ? 'abc' : is123File(name) ? '123' : isJlyFile(name) ? 'jly' : isJcxFile(name) ? 'jcx' : isPuFile(name) ? 'pu' : /\.(xml|musicxml)$/i.test(name) ? 'musicxml' : 'jpwabc';
  const text=formatOf(format).decode(bytes);
  validate(format,text);
  return {format,text};
}
function validate(format:DocFormatId,text:string):void {
  if(!text.trim()) throw new Error('文件没有乐谱内容，当前稿保持不变。');
  if(format === 'pu' && !sniffDialect(text).dialect) throw new Error('这份文本不是可识别的文本谱，当前稿保持不变。');
  const adapter=formatOf(format);
  if(adapter.toScoreDoc) {
    const doc=adapter.toScoreDoc(text);
    const rejected=adapter.reloadSpec.reject(doc);
    if(rejected || !doc.songs.length) throw new Error(rejected || '没有读到乐谱内容，当前稿保持不变。');
  } else {
    const file=JpwFile.fromString(text);
    if(!file || !jpwToScoreDoc(file).songs.length) throw new Error('这份文件不是可识别的 JPWABC 乐谱，当前稿保持不变。');
  }
}
