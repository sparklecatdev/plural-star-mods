export type SparkleAction = {kind: 'show' | 'accent'; value: string};
// React Native has no CSS cascade; translate declarations for script-owned components.
const cssNumbers = new Set('width height minWidth minHeight maxWidth maxHeight top right bottom left margin marginTop marginRight marginBottom marginLeft padding paddingTop paddingRight paddingBottom paddingLeft gap rowGap columnGap borderWidth borderTopWidth borderRightWidth borderBottomWidth borderLeftWidth borderRadius borderTopLeftRadius borderTopRightRadius borderBottomLeftRadius borderBottomRightRadius fontSize lineHeight letterSpacing opacity flex flexGrow flexShrink flexBasis zIndex elevation'.split(' '));
const cssStrings = new Set('color backgroundColor borderColor borderTopColor borderRightColor borderBottomColor borderLeftColor display position overflow alignItems alignSelf alignContent justifyContent flexDirection flexWrap textAlign textTransform textDecorationLine fontFamily fontStyle fontWeight resizeMode'.split(' '));
export function sparkleCss(input: string | TemplateStringsArray, ...values: unknown[]): Record<string, string | number> {
  const source = typeof input === 'string' ? input : input.reduce((text, part, i) => text + part + (i < values.length ? String(values[i]) : ''), '');
  if (source.length > 65536 || /[{}]/.test(source)) throw Error('CSS must contain declarations only.');
  const style: Record<string, string | number> = {};
  for (const declaration of source.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    if (!declaration.trim()) continue;
    const match = /^\s*([a-z][a-z-]*)\s*:\s*([^:;]+?)\s*$/i.exec(declaration);
    if (!match) throw Error('Invalid CSS declaration.');
    const property = match[1].replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const value = match[2].trim();
    if (cssNumbers.has(property)) {
      if (/^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px)?$/i.test(value)) style[property] = Number(value.replace(/px$/i, ''));
      else if (/^-?(?:\d+(?:\.\d+)?|\.\d+)%$/.test(value) && /^(width|height|minWidth|minHeight|maxWidth|maxHeight|top|right|bottom|left|margin|marginTop|marginRight|marginBottom|marginLeft|padding|paddingTop|paddingRight|paddingBottom|paddingLeft|flexBasis)$/.test(property)) style[property] = value;
      else if (value === 'auto' && /^(width|height|top|right|bottom|left|margin|marginTop|marginRight|marginBottom|marginLeft|flexBasis)$/.test(property)) style[property] = value;
      else throw Error(`Unsupported CSS value for ${match[1]}: ${value}`);
    } else if (cssStrings.has(property)) style[property] = value;
    else throw Error(`Unsupported CSS property: ${match[1]}`);
  }
  return style;
}
export type SparkleMod = {name: string; version: string; description: string; appearance: boolean; javascript?: boolean; handlers: {event: 'open' | 'tap'; actions: SparkleAction[]}[]};
export function parseSparkle(source: string): SparkleMod {
  if (source.length > 1048576) throw Error('Script exceeds 1 MiB.');
  if (source.startsWith('// sparkle ')) {
    const end = source.indexOf('\n');
    if (end < 0) throw Error('Missing script body.');
    let metadata: any;
    try { metadata = JSON.parse(source.slice(11, end)); } catch { throw Error('Invalid SparkleScript metadata.'); }
    if (!metadata || typeof metadata.name !== 'string' || !metadata.name.trim() || metadata.name.length > 80 || typeof metadata.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(metadata.version) || (metadata.description !== undefined && (typeof metadata.description !== 'string' || metadata.description.length > 500))) throw Error('Invalid SparkleScript metadata.');
    new Function('api', source);
    return {name: metadata.name, version: metadata.version, description: metadata.description || '', appearance: false, javascript: true, handlers: []};
  }
  let pos = 0;
  const error = (message: string): never => {
    const before = source.slice(0, pos).split('\n');
    throw Error(`${message} (line ${before.length}, column ${before[before.length - 1].length + 1})`);
  };
  const whitespace = () => { while (pos < source.length && /\s/.test(source[pos])) pos++; };
  const literal = (value: string) => { whitespace(); if (!source.startsWith(value, pos)) error(`Expected ${value}`); pos += value.length; };
  const word = (value: string) => { literal(value); if (/[A-Za-z0-9_]/.test(source[pos] || '')) error(`Expected ${value}`); };
  const string = () => {
    whitespace(); if (source[pos] !== '"') return error('Expected quoted text');
    const start = pos++;
    while (pos < source.length) {
      if (source[pos] === '\\') { pos += 2; continue; }
      if (source[pos++] === '"') {
        try { const value: unknown = JSON.parse(source.slice(start, pos)); if (typeof value !== 'string' || value.length > 500) return error('Text is too long'); return value; }
        catch { return error('Invalid quoted text'); }
      }
    }
    return error('Unterminated text');
  };
  word('mod'); const name = string(); word('version'); const version = string(); literal('{');
  if (!name.trim() || name.length > 80 || !/^\d+\.\d+\.\d+$/.test(version)) error('Invalid name or version');
  let description = '', appearance = false; const handlers: SparkleMod['handlers'] = [];
  whitespace(); if (source.startsWith('describe', pos)) { word('describe'); description = string(); }
  whitespace(); if (source.startsWith('allow', pos)) { word('allow'); word('appearance'); appearance = true; }
  while (true) {
    whitespace(); if (source[pos] === '}') { pos++; break; }
    if (handlers.length >= 8) error('Too many handlers');
    word('when'); whitespace(); let event: 'open' | 'tap';
    if (source.startsWith('open', pos)) { word('open'); event = 'open'; }
    else if (source.startsWith('tap', pos)) { word('tap'); event = 'tap'; }
    else return error('Expected open or tap event');
    literal('{'); const actions: SparkleAction[] = [];
    while (true) {
      whitespace(); if (source[pos] === '}') { pos++; break; }
      if (actions.length >= 8) error('Too many actions');
      if (source.startsWith('show', pos)) { word('show'); actions.push({kind: 'show', value: string()}); }
      else if (source.startsWith('accent', pos)) {
        word('accent'); const value = string();
        if (!appearance) error('Accent requires allow appearance');
        if (!/^#[0-9a-fA-F]{6}$/.test(value)) error('Accent must be a six-digit hex color');
        actions.push({kind: 'accent', value: value.toUpperCase()});
      } else return error('Expected show or accent');
    }
    if (!actions.length) error('Add an action'); handlers.push({event, actions});
  }
  whitespace(); if (pos !== source.length) error('Unexpected text');
  if (!handlers.length) error('Add at least one handler');
  return {name, version, description, appearance, handlers};
}
export function runSparkle(mod: SparkleMod, event: 'open' | 'tap', perform: (action: SparkleAction) => void): void {
  for (const handler of mod.handlers) if (handler.event === event) for (const action of handler.actions) perform(action);
}
