# SparkleScript

SparkleScript is a small language for local custom mods. Open **Settings → sparklecat's mods → Custom mods** to write code on your device, import a `.sparkle` file, save, enable, run, edit, or remove a mod. Imported scripts enter the editor for review; saving never enables them. Editing an existing script disables it again.

```sparkle
mod "Hello Star" version "1.0.0" {
  describe "A little greeting"
  when tap {
    show "Hello, star!"
  }
}
```

A mod has a name, a three-number version, optional `describe` text, optional `allow appearance`, and one or more event blocks. `when tap` runs when you press Run in Custom mods. `when open` runs after the app lock opens, at most once per launch and once per minute. `show "text"` shows a message. Strings use JSON-style double-quoted escapes.

Declare `allow appearance` before event blocks to use `accent "#RRGGBB"`. Enabling such a mod asks permission to change the accent background. Changes persist after a mod is disabled or removed; change them back under **Extra Customization**. Turn on Extra Customization to see the change; the script does not enable it automatically. A mod can have at most eight event blocks and eight actions per block, and show at most one dialog per event. Scripts are limited to 16 KiB and 20 installed mods.

Scripts run through a restricted interpreter; they cannot run JavaScript, access app data, files, native APIs, or the network. This first version does not support variables, conditions, functions, or front-change events. Custom scripts are stored locally on the device and are not included in mod sync or storage snapshots; keep copies elsewhere. Examples are in `examples/`.
