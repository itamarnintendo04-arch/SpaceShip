# SpaceShip Dev: its own icon (a blueprint of the ship, a gear and DEV) instead of the regular one.
# Copies assets/dev/icon-*.png over assets/icon-*.png before the icons are generated (dev builds only, never committed back).
import shutil, os
for name in ['icon-only.png', 'icon-foreground.png', 'icon-background.png']:
    src = os.path.join('assets', 'dev', name)
    if os.path.exists(src):
        shutil.copyfile(src, os.path.join('assets', name)); print('dev icon:', name)
