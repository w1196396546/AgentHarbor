import { Pairing } from "./views/Pairing";
import { Workspace } from "./views/Workspace";
import { Dialogs } from "./views/Dialogs";

export function RemoteApp() {
  return (
    <>
      <svg aria-hidden="true" className="liquid-filter-defs">
        <filter id="liquid-edge-refraction" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.018 0.045"
            numOctaves="2"
            seed="17"
            result="noise"
          />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <Pairing />
      <Workspace />
      <Dialogs />
    </>
  );
}
