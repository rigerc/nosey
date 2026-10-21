import {useApp} from 'ink';
import pkg from '../../package.json';
import {useEffect, useState} from 'react';
import type {AppOptions} from '../app';
import {ConfigWizard} from '../components/config';
import {Heading, InlineLayout, StatusBar} from '../components';
import {InputCaptureProvider, KeymapProvider} from '../hooks';
import {FooterHintsProvider, useActiveFooterHints} from '../hooks/useFooterHints';
import {ThemeProvider} from '../theme/context';

function Content({path}: {path?: string}) {
  const {exit} = useApp();
  const [finished, setFinished] = useState(false);
  const hints = useActiveFooterHints();
  useEffect(() => {
    if (finished) exit();
  }, [finished, exit]);
  return (
    <InlineLayout
      title={<Heading>{pkg.name} / configuration setup</Heading>}
      footer={
        <StatusBar hints={finished ? [] : [...hints, {key: 'ctrl+c', label: 'cancel setup'}]} />
      }
    >
      <ConfigWizard path={path} onFinish={() => setFinished(true)} />
    </InlineLayout>
  );
}

export function ConfigSetup({options}: {options: AppOptions}) {
  return (
    <ThemeProvider name={options.theme} ascii={options.ascii}>
      <InputCaptureProvider>
        <KeymapProvider>
          <FooterHintsProvider>
            <Content path={options.configFile} />
          </FooterHintsProvider>
        </KeymapProvider>
      </InputCaptureProvider>
    </ThemeProvider>
  );
}
