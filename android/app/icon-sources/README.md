# Launcher icon masters

512x512 source art for each flavor's Android launcher icon.
Density buckets under src/<flavor>/res/mipmap-* and the mipmap-anydpi-v26
adaptive XML + values/ic_launcher_background.xml are generated from these.

To regenerate after editing a master, re-run the sharp resize into:
  src/<flavor>/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/
    ic_launcher.png / ic_launcher_round.png  -> 48 / 72 / 96 / 144 / 192 px
    ic_launcher_foreground.png               -> 108 / 162 / 216 / 324 / 432 px
Adaptive foreground is inset 18%; background colour is #1A2B6D.
