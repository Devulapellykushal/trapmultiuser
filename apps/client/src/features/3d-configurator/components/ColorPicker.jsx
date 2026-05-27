import { HexColorPicker } from 'react-colorful';
import { useSnapshot } from 'valtio';

export default function ColorPicker(props) {
  const snap = useSnapshot(props.state);
  const variant = props.variant === 'inline' ? 'inline' : 'floating';
  const part = snap.current;
  const rootClass = [
    'color-picker',
    variant !== 'inline' && part === null ? 'hidden' : '',
    variant === 'inline' ? 'color-picker--inline' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClass}>
      {part ? (
        <>
          <HexColorPicker color={snap.colors[part]} onChange={(color) => props.updateColor(part, color)} />
          <h1>{part}</h1>
        </>
      ) : variant === 'inline' ? (
        <p className="hint" style={{ margin: 0 }}>
          Select a part on the bottle (body, cap, or neck), then pick a color here.
        </p>
      ) : null}
    </div>
  );
}
