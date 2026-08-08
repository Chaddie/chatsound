/** Minimal Web MIDI typings for browsers that expose the API. */
interface MIDIOptions {
  sysex?: boolean;
  software?: boolean;
}

interface MIDIMessageEvent extends Event {
  data: Uint8Array | null;
}

interface MIDIInput extends EventTarget {
  id: string;
  name: string | null;
  onmidimessage: ((event: MIDIMessageEvent) => void) | null;
}

interface MIDIInputMap {
  forEach(callback: (input: MIDIInput, key: string) => void): void;
  get(id: string): MIDIInput | undefined;
}

interface MIDIAccess extends EventTarget {
  inputs: MIDIInputMap;
}
