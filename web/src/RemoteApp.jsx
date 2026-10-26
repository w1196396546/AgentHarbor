import { Pairing } from "./views/Pairing";
import { Workspace } from "./views/Workspace";
import { Dialogs } from "./views/Dialogs";

export function RemoteApp() {
  return (
    <>
      <Pairing />
      <Workspace />
      <Dialogs />
    </>
  );
}
