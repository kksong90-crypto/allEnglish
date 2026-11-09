// Candidate internal adapter. Properties are NOT set by this module.
function abLegacyNativeServicesForUser_(user) {
 if(!user||typeof user!=='object')throw Error('LEGACY_NATIVE_SESSION_REQUIRED');
 var locator=abLegacyNativePinnedConfig_(PropertiesService.getScriptProperties()),raw=locator.raw,pin=locator.pin;
 if(typeof raw!=='string'||!raw||typeof pin!=='string'||vocaApiSha256_(raw)!==pin)throw Error('LEGACY_NATIVE_CONFIG_UNAVAILABLE');
 if(vocaRepositoryBytes_(raw)>8000)throw Error('LEGACY_NATIVE_PROPERTY_TOO_LARGE');
 var config=JSON.parse(raw),coreId=abConfigCoreDbId_();
 if(config&&config.catalogLocation&&!config.books)config.books=abLegacyNativeCatalogChunks_(config);
 if(config.schema!=='STUDENT_LEGACY_NATIVE_CATALOG_V1'||typeof config.vocabDbId!=='string'||!config.vocabDbId||config.vocabDbId===coreId||!Array.isArray(config.books)||!config.books.length)throw Error('LEGACY_NATIVE_CONFIG_INVALID');
 var active=Object.create(null);abActiveVocabBooks_().forEach(function(b){active[abText_(b.vocab_book_id)]=abText_(b.name);});
 var revisions=Object.create(null),books=Object.create(null);
 config.books.forEach(function(b){
  if(typeof b.bookId!=='string'||!b.bookId||books[b.bookId]||b.sourceFacet!=='LEGACY_STUDENT_BOOK_DAY'||typeof b.revisionId!=='string'||b.revisionId.indexOf('LEGACYDTO-')!==0||revisions[b.revisionId]||!Array.isArray(b.sections)||!b.sections.length)throw Error('LEGACY_NATIVE_CONFIG_INVALID');
  books[b.bookId]=b;revisions[b.revisionId]=b;
 });
 function allowed(payload){
  var b=revisions[payload.revisionId];
  return !!b&&Object.prototype.hasOwnProperty.call(active,b.bookId)&&active[b.bookId]===b.name&&Array.isArray(payload.sectionIds)&&payload.sectionIds.length===1&&b.sections.filter(function(s){return s.sectionId===payload.sectionIds[0];}).length===1;
 }
 var services=vocaRepositorySheetsServices_({vocabDbId:config.vocabDbId,coreDbId:coreId},function(payload){return allowed(payload);});
 var originalManifest=services.readManifest;
 services.readManifest=function(revisionId){
  var b=revisions[revisionId];if(!b||!Object.prototype.hasOwnProperty.call(active,b.bookId)||active[b.bookId]!==b.name)throw Error('LEGACY_NATIVE_SCOPE_DENIED');
  var manifest=originalManifest(revisionId);
  if(manifest.sourceFacet!==b.sourceFacet||manifest.legacyBookId!==b.bookId||manifest.sourceDtoHash!==b.sourceDtoHash)throw Error('LEGACY_NATIVE_SOURCE_FACET_CHANGED');
  if(Object.keys(manifest.sections).length!==b.sections.length||b.sections.some(function(s){return !manifest.sections[s.sectionId]||manifest.sections[s.sectionId].wordCount!==s.wordCount;}))throw Error('LEGACY_NATIVE_CATALOG_CHANGED');
  return manifest;
 };
 return {
  readCatalog:function(){return JSON.parse(JSON.stringify(config.books.filter(function(b){return Object.prototype.hasOwnProperty.call(active,b.bookId);})));},
  readSectionPage:function(payload){if(!allowed(payload))throw Error('LEGACY_NATIVE_SCOPE_DENIED');return vocaRepositorySectionPage_(payload,{includeInternal:false},services);},
  readWordFragment:function(payload){if(!allowed(payload))throw Error('LEGACY_NATIVE_SCOPE_DENIED');return vocaRepositoryWordFragment_(payload,{includeInternal:false},services);},
  sha256:vocaApiSha256_
 };
}
function abLegacyNativeCatalogChunks_(config) {
 var loc=config.catalogLocation;
 if(typeof config.vocabDbId!=='string'||!config.vocabDbId||config.vocabDbId===abConfigCoreDbId_()||loc.sheet!=='LegacyBrowseCatalog'||typeof loc.catalogId!=='string'||!loc.catalogId||!Number.isSafeInteger(loc.firstRow)||loc.firstRow<2||!Number.isSafeInteger(loc.rowCount)||loc.rowCount<1||loc.rowCount>100||!Number.isSafeInteger(loc.utf8Bytes)||loc.utf8Bytes<1||loc.utf8Bytes>4000000||!/^[a-f0-9]{64}$/.test(loc.sha256))throw Error('LEGACY_NATIVE_CATALOG_LOCATOR_INVALID');
 var sheet=SpreadsheetApp.openById(config.vocabDbId).getSheetByName('LegacyBrowseCatalog');
 var headers=['catalog_id','chunk_no','content_fragment','fragment_hash'];
 if(!sheet||sheet.getLastColumn()!==4||JSON.stringify(sheet.getRange(1,1,1,4).getDisplayValues()[0])!==JSON.stringify(headers)||loc.firstRow+loc.rowCount-1>sheet.getLastRow())throw Error('LEGACY_NATIVE_CATALOG_SCHEMA_INVALID');
 var rows=sheet.getRange(loc.firstRow,1,loc.rowCount,4).getDisplayValues(),text='';
 if(rows.length!==loc.rowCount)throw Error('LEGACY_NATIVE_CATALOG_INCOMPLETE');
 rows.forEach(function(row,i){if(row[0]!==loc.catalogId||String(row[1])!==String(i)||typeof row[2]!=='string'||!row[2]||vocaRepositoryBytes_(row[2])>30000||vocaApiSha256_(row[2])!==row[3])throw Error('LEGACY_NATIVE_CATALOG_CHUNK_INVALID');text+=row[2];});
 if(vocaRepositoryBytes_(text)!==loc.utf8Bytes||vocaApiSha256_(text)!==loc.sha256)throw Error('LEGACY_NATIVE_CATALOG_HASH_INVALID');
 var payload=JSON.parse(text);if(payload.schema!=='STUDENT_LEGACY_NATIVE_CATALOG_PAYLOAD_V1'||!Array.isArray(payload.books))throw Error('LEGACY_NATIVE_CATALOG_PAYLOAD_INVALID');return payload.books;
}

function abLegacyNativePinnedConfig_(props) {
 var expectedRaw="{\"schema\":\"STUDENT_LEGACY_NATIVE_CATALOG_V1\",\"vocabDbId\":\"1BUN-aHFV9-XPumNTpDM6F1KDHsh1ezqRi_LxkJjPYJ0\",\"catalogLocation\":{\"sheet\":\"LegacyBrowseCatalog\",\"catalogId\":\"LEGACYCATALOG-0a1212e4a18e8d1259a792266cc02907af10a87a661e5381f7370548674ad23f\",\"firstRow\":5,\"rowCount\":3,\"utf8Bytes\":88530,\"sha256\":\"0a1212e4a18e8d1259a792266cc02907af10a87a661e5381f7370548674ad23f\"}}",expectedPin="f3d8b4d658ad84a0028ed50cf46391808ebb4a9f134fe58ae11fb7242208be38";
 var previousRaw="{\"schema\":\"STUDENT_LEGACY_NATIVE_CATALOG_V1\",\"vocabDbId\":\"1BUN-aHFV9-XPumNTpDM6F1KDHsh1ezqRi_LxkJjPYJ0\",\"catalogLocation\":{\"sheet\":\"LegacyBrowseCatalog\",\"catalogId\":\"LEGACYCATALOG-0061ab45c9e79a0f8499e458f1ae92bcfbe3fb432b6a801f8ceb5ecc08081932\",\"firstRow\":2,\"rowCount\":3,\"utf8Bytes\":82198,\"sha256\":\"0061ab45c9e79a0f8499e458f1ae92bcfbe3fb432b6a801f8ceb5ecc08081932\"}}",previousPin="fa489c4ccdb0539f0398339c073372ed1333ef9a34d98a5a2ed0f8076d49e669";
 var raw=props.getProperty('AB_LEGACY_NATIVE_CATALOG_V1'),pin=props.getProperty('AB_LEGACY_NATIVE_CATALOG_SHA256');
 // Accept only the two sealed release configurations. Preserve properties.
 if ((raw===null&&pin===null)||(raw===previousRaw&&pin===previousPin)||(raw===expectedRaw&&pin===expectedPin)) return {raw:expectedRaw,pin:expectedPin};
 throw Error('LEGACY_NATIVE_EXISTING_CONFIG_CONFLICT');
}
