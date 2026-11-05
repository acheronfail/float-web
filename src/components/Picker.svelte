<script lang="ts" module>
  import type { HTMLAttributes } from 'svelte/elements';

  export interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
    file?: File;
  }
</script>

<script lang="ts">
  import type { ChangeEventHandler } from 'svelte/elements';
  import Modal from './Modal.svelte';
  import { demoFile } from '../lib/parse/float-control';
  import Link from './Link.svelte';
  import { supportedMimeTypeString } from '../lib/parse';

  let { file = $bindable(), ...rest }: Props = $props();

  const onchange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const { files } = e.currentTarget;
    if (files && files.length > 0) {
      file = files[0];
    }
  };
</script>

<Modal open={!file} closeHandler={() => (file = demoFile)} closeText="view demo ride" title="Welcome!" {...rest}>
  <div class="flex flex-col justify-between items-center gap-4">
    <p>To get started, please open either:</p>
    <ul class="list-disc list-inside text-left">
      <li>
        an exported <span class="font-mono">CSV</span> or <span class="font-mono">ZIP</span> file from
        <strong>Float Control</strong>
      </li>
      <li>an exported <span class="font-mono">CSV</span> file from <strong>VESC Tool</strong></li>
      <li>an exported <span class="font-mono">CSV</span> file from <strong>Float View Mobile</strong></li>
      <li>
        an exported <span class="font-mono">JSON</span> or <span class="font-mono">CSV</span> file from
        <strong>Floaty</strong>
      </li>
      <li>... or drag and drop a supported file onto this window!</li>
    </ul>
    <input
      id="ride-file-picker"
      class="text-center file:mr-4 file:py-2 file:px-4
      file:rounded file:border file:border-solid file:border-slate-600
      file:text-sm file:text-white file:font-bold file:bg-slate-700 active:file:bg-slate-800"
      type="file"
      {onchange}
      accept={supportedMimeTypeString}
    />
  </div>
  <section aria-labelledby="native-apps-title" class="my-6 w-full max-w-xl rounded-lg border bg-slate-900 p-4">
    <h3 id="native-apps-title" class="text-lg font-bold">Get the Float View app</h3>
    <p class="mt-2 text-sm">
      Connect to your VESC, watch live telemetry, record and review rides, and configure Refloat with the native app.
    </p>
    <div class="mt-4 flex flex-wrap justify-center gap-3">
      <a
        href="https://apps.apple.com/app/id6823768488"
        class="rounded border bg-slate-700 px-4 py-2 text-sm font-bold hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
      >
        iOS · App Store
      </a>
      <a
        href="https://apps.apple.com/app/id6823913513"
        class="rounded border bg-slate-700 px-4 py-2 text-sm font-bold hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
      >
        macOS · Mac App Store
      </a>
      <!-- TODO: Replace this placeholder with the Google Play link before merging. -->
      <span class="rounded border px-4 py-2 text-sm text-slate-400">Android · Coming soon on Google Play</span>
    </div>
    <p class="mt-3 text-xs">
      <Link href="https://github.com/acheronfail/float-view-mobile" label="Source code and more installation options" />
    </p>
  </section>
  <div class="grow flex flex-col justify-end items-center text-left text-xs">
    <h4 class="font-bold my-2 text-sm">Some notes:</h4>
    <ul class="list-disc list-inside">
      <li>
        <strong>Data never leaves your device, your browser does all the work!</strong>
      </li>
      <li>
        Source code available here: <Link
          href="https://github.com/acheronfail/float-view"
          label="acheronfail/float-view"
        />
      </li>
      <li>
        Credit to <Link
          href="https://apps.apple.com/au/app/float-control-vesc-companion/id1590924299"
          label="Float Control"
        /> and <Link
          href="https://play.google.com/store/apps/details?id=com.floaty.floatyapp&pcampaignid=web_share"
          label="Floaty"
        /> for making great VESC apps!
      </li>
      <li>
        Credit to <Link href="https://jf.id.au/blog/how-i-built-the-best-chart-in-the-world" label="jakzo" /> for examples
        of excellent charts!
      </li>
      <li>
        Credit to <Link href="https://thenounproject.com/icon/onewheel-4260841/" label="Luis Prado" /> for the Onewheel Rider
        Icon!
      </li>
      <li class="font-mono">
        Build version: {import.meta.env.VITE_BUILD_VERSION}
      </li>
    </ul>
    <h4 class="font-bold my-2 text-sm">This site can be saved to your device:</h4>
    <ol class="list-decimal list-inside">
      <li>Open the website in your browser (you're already here)</li>
      <li>Click the Share button</li>
      <li>Select <strong class="font-mono">Add to Home Screen</strong></li>
      <li>Now you can use it offline whenever you'd like</li>
    </ol>
  </div>
</Modal>
