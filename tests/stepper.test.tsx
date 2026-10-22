import {setTimeout as tick} from 'node:timers/promises';
import {renderToString, Text} from 'ink';
import {describe, expect, it, vi} from 'vite-plus/test';
import {Step, Stepper, type StepContext} from '../src/components';
import {mount, output, press, settle} from './helpers/terminal';

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return {promise, resolve};
}

describe('Stepper', () => {
  it('renders first-step content synchronously, including fragments and conditional children', () => {
    const showHidden = vi.fn(() => false);

    const out = renderToString(
      <Stepper onComplete={() => {}}>
        <>
          {showHidden() && (
            <Step name="Hidden">
              <Text>Hidden body</Text>
            </Step>
          )}
          <Step name="One">
            <Text>First body</Text>
          </Step>
          <Step name="Two">
            <Text>Second body</Text>
          </Step>
        </>
      </Stepper>,
    );

    expect(out).toContain('First body');
    expect(out).not.toContain('Second body');
    expect(out).not.toContain('Hidden');
  });

  it('advances, goes back, and cancels on Escape at the start', async () => {
    const cancel = vi.fn();
    const change = vi.fn();
    let current!: StepContext;

    const capture = (context: StepContext) => {
      current = context;

      return <Text>Body {context.currentStep}</Text>;
    };

    const app = await mount(
      <Stepper onComplete={() => {}} onCancel={cancel} onStepChange={change}>
        <Step name="One">{capture}</Step>
        <Step name="Two">{capture}</Step>
      </Stepper>,
    );

    await press(app, '\r');
    expect(current.currentStep).toBe(1);
    await press(app, '\u001b');
    await tick(30);
    await settle(); // Ink waits for a possible escape-sequence suffix.
    expect(current.currentStep).toBe(0);
    await press(app, '\u001b');
    await expect.poll(() => cancel.mock.calls.length).toBe(1);
    expect(change.mock.calls).toEqual([[1], [0]]);
  });

  it('blocks boolean validation and catches rejected validation with visible feedback', async () => {
    let current!: StepContext;
    const onError = vi.fn();
    const complete = vi.fn();

    const content = (context: StepContext) => {
      current = context;

      return <Text>Input</Text>;
    };

    const app = await mount(
      <Stepper onComplete={complete}>
        <Step name="Input" canProceed={false}>
          {content}
        </Step>
      </Stepper>,
    );

    await current.goNext();
    await settle();
    expect(complete).not.toHaveBeenCalled();
    app.rerender(
      <Stepper onComplete={complete} onError={onError}>
        <Step
          name="Input"
          canProceed={async () => {
            throw new Error('Validation failed');
          }}
        >
          {content}
        </Step>
      </Stepper>,
    );
    await settle();
    await current.goNext();
    await settle();
    expect(onError).toHaveBeenCalledOnce();
    expect(output(app)).toContain('Validation failed');
    expect(current.isValidating).toBe(false);
    expect(complete).not.toHaveBeenCalled();
  });

  it('locks all navigation throughout async exit validation and completes only once', async () => {
    let current!: StepContext;
    const pending = deferred<boolean>();
    const exit = vi.fn(() => pending.promise);
    const complete = vi.fn();
    const cancel = vi.fn();

    await mount(
      <Stepper onComplete={complete} onCancel={cancel} onExitStep={exit}>
        <Step name="Only">
          {(context) => {
            current = context;

            return <Text>Only</Text>;
          }}
        </Step>
      </Stepper>,
    );

    const navigation = current.goNext();
    await settle();
    expect(current.isValidating).toBe(true);
    await current.goNext();
    await current.goBack();
    current.cancel();
    expect(exit).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
    pending.resolve(true);
    await navigation;
    await settle();
    await current.goNext();
    expect(complete).toHaveBeenCalledOnce();
  });

  it('holds the same-event lock for synchronous guards too', async () => {
    let current!: StepContext;
    const complete = vi.fn();

    await mount(
      <Stepper onComplete={complete}>
        <Step name="One">
          {(context) => {
            current = context;

            return <Text>One</Text>;
          }}
        </Step>
      </Stepper>,
    );

    await Promise.all([current.goNext(), current.goNext(), current.goNext()]);
    await settle();
    expect(complete).toHaveBeenCalledOnce();
  });

  it('respects exit vetoes, while raw jumps skip canProceed and clamp indexes', async () => {
    let current!: StepContext;
    const exit = vi.fn(() => false);
    const change = vi.fn();

    const capture = (context: StepContext) => {
      current = context;

      return <Text>Body</Text>;
    };

    const view = () => (
      <Stepper onComplete={() => {}} onExitStep={exit} onStepChange={change}>
        <Step name="One" canProceed={false}>
          {capture}
        </Step>
        <Step name="Two">{capture}</Step>
      </Stepper>
    );

    await mount(view());
    await current.goTo(100);
    await settle();
    expect(current.currentStep).toBe(0);
    exit.mockReturnValue(true); // onExitStep accepts any result except false.
    await current.goTo(100);
    await settle();
    expect(current.currentStep).toBe(1);
    expect(change).toHaveBeenCalledWith(1);
    await current.goTo(-5);
    await settle();
    expect(current.currentStep).toBe(0);
  });

  it('reports controlled navigation without changing the supplied index', async () => {
    let current!: StepContext;
    const change = vi.fn();

    const capture = (context: StepContext) => {
      current = context;

      return <Text>{context.currentStep}</Text>;
    };

    const view = (step: number) => (
      <Stepper step={step} initialStep={1} onComplete={() => {}} onStepChange={change}>
        <Step name="One">{capture}</Step>
        <Step name="Two">{capture}</Step>
      </Stepper>
    );

    const app = await mount(view(0));
    await current.goNext();
    await settle();
    expect(change).toHaveBeenCalledWith(1);
    expect(current.currentStep).toBe(0);
    app.rerender(view(1));
    await settle();
    expect(current.currentStep).toBe(1);
  });

  it('keeps a keyed active step when earlier steps are inserted', async () => {
    let current!: StepContext;

    const capture = (context: StepContext) => {
      current = context;

      return <Text>Body</Text>;
    };

    const view = (extra: boolean) => (
      <Stepper initialStep={1} onComplete={() => {}}>
        {extra && (
          <Step key="extra" name="Extra">
            {capture}
          </Step>
        )}
        <Step key="one" name="One">
          {capture}
        </Step>
        <Step key="two" name="Two">
          {capture}
        </Step>
      </Stepper>
    );

    const app = await mount(view(false));
    app.rerender(view(true));
    await settle();
    expect(current.currentStep).toBe(2);
  });

  it('discards a pending transition after the controlled source changes', async () => {
    let current!: StepContext;
    const pending = deferred<boolean>();
    const change = vi.fn();

    const capture = (context: StepContext) => {
      current = context;

      return <Text>Body</Text>;
    };

    const view = (step: number) => (
      <Stepper step={step} onComplete={() => {}} onStepChange={change}>
        <Step name="One" canProceed={() => pending.promise}>
          {capture}
        </Step>
        <Step name="Two">{capture}</Step>
      </Stepper>
    );

    const app = await mount(view(0));
    const navigation = current.goNext();
    await settle();
    app.rerender(view(1));
    await settle();
    pending.resolve(true);
    await navigation;
    await settle();
    expect(change).not.toHaveBeenCalled();
    expect(current.currentStep).toBe(1);
  });

  it('ignores keyboard input when disabled and does not complete an empty wizard', async () => {
    const complete = vi.fn();

    const app = await mount(
      <Stepper keyboardNav={false} onComplete={complete}>
        <Step name="Only">
          <Text>Only</Text>
        </Step>
      </Stepper>,
    );

    await press(app, '\r');
    expect(complete).not.toHaveBeenCalled();
    app.rerender(<Stepper onComplete={complete}>{null}</Stepper>);
    await settle();
    await press(app, '\r');
    expect(complete).not.toHaveBeenCalled();
  });
});
