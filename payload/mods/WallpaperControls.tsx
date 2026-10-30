import React from 'react';
import {BackgroundSection} from '../modals/system/BackgroundSection';
import {useAppStore} from '../store/appStore';
import {changeBackgroundImage} from '../store/actions';

export function WallpaperControls() {
  const filename = useAppStore(s => s.appSettings.backgroundImage);
  return <BackgroundSection filename={filename} onChange={changeBackgroundImage} />;
}
