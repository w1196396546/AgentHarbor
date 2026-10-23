import { RemoteIcon as Icon } from "../components/RemoteIcon";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Modal, MenuSurface } from "../components/workspace-surfaces";

export function Dialogs() {
  return (
    <>
      <Modal id="sessionInfoDialog" className="session-info-dialog" aria-labelledby="sessionInfoTitle">
        <div className="dialog-heading"><h2 id="sessionInfoTitle" data-t="Session information"></h2><Button variant="ghost" id="closeSessionInfo" className="icon-button" type="button" data-label="Close dialog"><Icon name="close" /></Button></div>
        <div id="sessionInfoContent"></div>
      </Modal>
      <Modal
        id="subagentsDialog"
        className="subagents-dialog"
        aria-labelledby="subagentsTitle"
      >
        <div className="dialog-heading">
          <Button
            variant="ghost"
            id="subagentsBack"
            className="icon-button"
            type="button"
            data-label="Back to agents"
            hidden
          >
            <Icon name="back" />
          </Button>
          <h2 id="subagentsTitle" data-t="Agents"></h2>
          <Button
            variant="ghost"
            id="closeSubagents"
            className="icon-button"
            type="button"
            data-label="Close dialog"
          >
            <Icon name="close" />
          </Button>
        </div>
        <p id="subagentsStatus" className="note" role="status"></p>
        <div id="subagentsList" className="subagents-list"></div>
        <div id="subagentConversation" className="subagent-conversation" hidden>
          <Button
            variant="ghost"
            id="subagentOlder"
            className="subtle"
            type="button"
            data-t="Load older conversation"
            hidden
          ></Button>
          <div id="subagentMessages"></div>
        </div>
      </Modal>
      <Modal id="deviceDialog" aria-labelledby="deviceDialogTitle">
        <div className="dialog-heading">
          <h2 id="deviceDialogTitle" data-t="Connected computer"></h2>
          <Button
            variant="ghost"
            id="closeDeviceDialog"
            className="icon-button"
            type="button"
            data-label="Close dialog"
          >
            <span data-icon="close">
              <Icon name="close" />
            </span>
          </Button>
        </div>
        <p id="deviceDetails"></p>
        <p>
          <a href="/account" data-t="My account and devices"></a>
        </p>
        <p data-t="Manage shared projects and authorized browsers on the remote connection page in agentTools."></p>
      </Modal>
      <section
        data-slot="popover-content"
        id="reasoningCard"
        className="reasoning-card"
        role="dialog"
        aria-labelledby="reasoningTitle"
        hidden
      >
        <div className="reasoning-card-heading">
          <h2
            id="reasoningTitle"
            className="sr-only"
            data-t="Model and reasoning"
          ></h2>
          <Button
            variant="ghost"
            id="reasoningReset"
            className="icon-button"
            type="button"
            data-label="Reset reasoning effort"
          >
            <span data-icon="refresh">
              <Icon name="refresh" />
            </span>
          </Button>
          <Button
            variant="ghost"
            id="closeReasoning"
            className="icon-button"
            type="button"
            data-label="Close dialog"
          >
            <span data-icon="close">
              <Icon name="close" />
            </span>
          </Button>
        </div>
        <div className="reasoning-current">
          <p
            id="reasoningLabel"
            className="reasoning-label"
            data-t="Default effort"
          ></p>
          <Button
            variant="ghost"
            id="reasoningModel"
            className="reasoning-model"
            type="button"
            aria-haspopup="menu"
          >
            <span id="reasoningModelName" data-t="Configured model"></span>
            <span data-icon="chevron">
              <Icon name="chevron" />
            </span>
          </Button>
        </div>
        <div className="reasoning-slider">
          <Label
            htmlFor="reasoningRange"
            className="sr-only"
            data-t="Reasoning effort"
          ></Label>
          <input
            data-slot="input"
            id="reasoningRange"
            type="range"
            min="0"
            max="0"
            step="1"
            defaultValue="0"
            aria-describedby="reasoningDescription"
            disabled
          />
        </div>
        <p id="reasoningDescription" className="reasoning-description"></p>
        <p
          id="reasoningHint"
          className="reasoning-hint"
          role="status"
          hidden
        ></p>
      </section>
      <Modal
        id="contextUsageDialog"
        className="context-usage-dialog"
        aria-labelledby="contextUsageTitle"
        aria-describedby="contextUsageSummary"
      >
        <div className="dialog-heading">
          <h2 id="contextUsageTitle" data-t="Context usage"></h2>
          <Button
            variant="ghost"
            id="closeContextUsage"
            className="icon-button"
            type="button"
            data-label="Close dialog"
          >
            <span data-icon="close">
              <Icon name="close" />
            </span>
          </Button>
        </div>
        <p id="contextUsageSummary" className="context-summary"></p>
        <dl id="contextUsageDetail" className="context-details"></dl>
      </Modal>
      <MenuSurface id="menu" className="floating-menu" hidden />
      <Modal id="requestDialog" aria-labelledby="requestTitle">
        <div className="dialog-heading">
          <span className="request-icon" data-icon="shield">
            <Icon name="shield" />
          </span>
          <h2 id="requestTitle"></h2>
          <Button
            variant="ghost"
            id="dismissRequest"
            className="icon-button"
            type="button"
            data-label="Close dialog"
          >
            <span data-icon="close">
              <Icon name="close" />
            </span>
          </Button>
        </div>
        <div id="requests"></div>
      </Modal>
      <Modal id="permissionDialog" aria-labelledby="permissionTitle">
        <div className="dialog-heading">
          <span className="request-icon" data-icon="shield">
            <Icon name="shield" />
          </span>
          <h2 id="permissionTitle" data-t="Allow full access?"></h2>
        </div>
        <p data-t="Codex can modify files anywhere on this computer and use the network. Only enable this for tasks you trust."></p>
        <p data-t="Command approvals are disabled. Apps and tools may still request authorization or information."></p>
        <div className="dialog-actions">
          <Button
            variant="ghost"
            id="cancelPermission"
            type="button"
            data-t="Cancel"
          ></Button>
          <Button
            variant="ghost"
            id="confirmPermission"
            className="primary"
            type="button"
            data-t="Allow full access"
          ></Button>
        </div>
      </Modal>
      <Modal
        id="revisePlanDialog"
        aria-labelledby="revisePlanTitle"
        aria-describedby="revisePlanDescription"
      >
        <form id="revisePlanForm">
          <div className="dialog-heading">
            <span className="request-icon" data-icon="plan">
              <Icon name="plan" />
            </span>
            <h2
              id="revisePlanTitle"
              data-t="What would you like to add or change?"
            ></h2>
          </div>
          <p
            id="revisePlanDescription"
            data-t="Codex will refine the plan using your feedback. You can review it again before execution."
          ></p>
          <Label
            htmlFor="planFeedback"
            className="sr-only"
            data-t="Plan feedback"
          ></Label>
          <Textarea
            id="planFeedback"
            rows="5"
            maxLength="60000"
            required
            data-placeholder="Describe your additions, changes, or constraints."
          ></Textarea>
          <p id="planFeedbackError" role="alert"></p>
          <div className="dialog-actions">
            <Button
              variant="ghost"
              id="cancelRevisePlan"
              type="button"
              data-t="Cancel"
            ></Button>
            <Button
              variant="ghost"
              id="confirmRevisePlan"
              className="primary"
              type="submit"
              data-t="Update plan"
            ></Button>
          </div>
        </form>
      </Modal>
      <Modal id="executePlanDialog" aria-labelledby="executePlanTitle">
        <div className="dialog-heading">
          <span className="request-icon" data-icon="plan">
            <Icon name="plan" />
          </span>
          <h2 id="executePlanTitle" data-t="Execute this plan?"></h2>
        </div>
        <p data-t="Codex will switch to implementation mode and follow this plan with the selected permissions."></p>
        <p id="executePlanPermissions" className="plan-permission"></p>
        <div className="dialog-actions">
          <Button
            variant="ghost"
            id="cancelExecutePlan"
            type="button"
            data-t="Keep planning"
          ></Button>
          <Button
            variant="ghost"
            id="confirmExecutePlan"
            className="primary"
            type="button"
            data-t="Execute plan"
          ></Button>
        </div>
      </Modal>
      <Modal id="queueEditDialog" aria-labelledby="queueEditTitle">
        <form id="queueEditForm">
          <div className="dialog-heading">
            <span className="request-icon" data-icon="clock">
              <Icon name="clock" />
            </span>
            <h2 id="queueEditTitle" data-t="Edit queued message"></h2>
          </div>
          <Label
            htmlFor="queueEditText"
            className="sr-only"
            data-t="Message"
          ></Label>
          <Textarea
            id="queueEditText"
            rows="6"
            maxLength="64000"
            spellCheck="false"
          ></Textarea>
          <p id="queueEditError" role="alert" hidden></p>
          <div className="dialog-actions">
            <Button
              variant="ghost"
              id="cancelQueueEdit"
              type="button"
              data-t="Cancel"
            ></Button>
            <Button
              variant="ghost"
              id="saveQueueEdit"
              className="primary"
              type="submit"
              data-t="Save changes"
            ></Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
