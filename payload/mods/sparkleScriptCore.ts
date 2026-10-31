/** SparkleScript is parsed as data. It never evaluates JavaScript or accesses host objects. */
export type SparkleAction = {kind: 'show' | 'accent'; value: string};
export type SparkleMod = {name: string; version: string; description: string; appearance: boolean; handlers: {event: 'open' | 'tap'; actions: SparkleAction[]}[]};
export function parseSparkle(source: string): SparkleMod {
  if (source.length > 16384) throw Error('Script exceeds 16 KiB.');
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
