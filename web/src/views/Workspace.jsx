import { RemoteIcon as Icon } from "../components/RemoteIcon";
import { Button } from "../components/ui/button";
import { Panel } from "../components/ui/panel";
import { Label } from "../components/ui/label";
import { Breadcrumb } from "../components/ui/breadcrumb";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Kbd } from "../components/ui/kbd";
import { Alert } from "../components/ui/alert";
import { Empty, EmptyMedia } from "../components/ui/empty";
import {
  ComposerSurface,
  ComposerFooter,
  ComposerFooterEnd,
} from "../components/ui/composer";
import {
  MenuSurface,
  SearchField,
  Sidebar,
  DecisionSurface,
} from "../components/workspace-surfaces";
import { ThemeToggle } from "../theme";
import { DeviceSwitcher } from "../components/DeviceSwitcher";

export function Workspace() {
  return (
    <>
      <main id="workspace" hidden>
        <Button
          variant="ghost"
          id="navBackdrop"
          className="backdrop"
          type="button"
          data-label="Close navigation"
          hidden
        ></Button>
        <Sidebar id="sidebar" aria-label="Projects and sessions">
          <a className="brand" href="/">
            <span className="brand-mark">
              <Icon name="brand" />
            </span>
            <span className="brand-copy">
              <strong id="activeAgentName" data-t="Codex"></strong>
              <small>anywhereToAgent</small>
            </span>
          </a>
          <div className="agent-switcher">
            <Label
              htmlFor="agentSelect"
              className="sr-only"
              data-t="Agent"
            ></Label>
            <select
              id="agentSelect"
              data-label="Agent"
              className="agent-switcher-control"
              disabled
            ></select>
            <p
              id="agentConnectionStatus"
              className="agent-connection-status"
              role="status"
              hidden
            ></p>
          </div>
          <SearchField className="search-box">
            <span data-icon="search">
              <Icon name="search" />
            </span>
            <Input
              id="search"
              type="search"
              data-label="Search conversations"
              data-placeholder="Search conversations"
              autoComplete="off"
            />
            <Kbd aria-hidden="true">⌘ K</Kbd>
          </SearchField>
          <Button variant="ghost" id="new" className="nav-action" type="button">
            <span data-icon="plus">
              <Icon name="plus" />
            </span>
            <span data-t="New session"></span>
            <Kbd>⌘ N</Kbd>
          </Button>

          <details id="navigation" open>
            <summary data-t="Projects and sessions"></summary>
            <div className="list-heading">
              <span data-t="Workspace"></span>
              <Button
                variant="ghost"
                id="refresh"
                className="icon-button"
                type="button"
                data-label="Refresh"
              >
                <span data-icon="refresh">
                  <Icon name="refresh" />
                </span>
              </Button>
            </div>
            <div className="project-menu">
              <Button
                variant="ghost"
                id="project"
                type="button"
                className="project-button"
                aria-haspopup="menu"
                aria-expanded="false"
              ></Button>
              <MenuSurface id="projects" hidden />
            </div>
            <div className="list-heading history-heading">
              <span data-t="Projects and sessions"></span>
              <span id="sessionCount"></span>
            </div>
            <nav id="sessions" aria-label="Sessions"></nav>
            <Button
              variant="ghost"
              id="more"
              className="subtle"
              type="button"
              data-t="Load more"
              hidden
            ></Button>
          </details>
          <div className="sidebar-footer">
            <DeviceSwitcher pairRequested />
            <div>
              <a className="settings-link" href="/account">
                <span data-icon="agent">
                  <Icon name="agent" />
                </span>
                <span data-t="My account and devices"></span>
              </a>
              <ThemeToggle />
              <Button
                variant="ghost"
                id="language"
                className="subtle"
                type="button"
                aria-haspopup="menu"
              >
                中文 / EN
              </Button>
              <Button
                variant="ghost"
                id="logout"
                className="icon-button"
                type="button"
                data-label="Disconnect browser"
                hidden
              >
                <span data-icon="logout">
                  <Icon name="logout" />
                </span>
              </Button>
            </div>
          </div>
          <div
            id="sidebarResize"
            role="separator"
            tabIndex="0"
            aria-orientation="vertical"
            aria-controls="sidebar"
            aria-valuemin="220"
            aria-valuemax="480"
            aria-valuenow="270"
            aria-describedby="sidebarResizeHint"
            data-label="Resize sidebar"
          ></div>
          <span
            id="sidebarResizeHint"
            className="sr-only"
            data-t="Use arrow keys to resize. Home for minimum width, End for maximum width."
          ></span>
        </Sidebar>
        <section className="main-shell">
          <header className="conversation-heading">
            <Button
              variant="ghost"
              id="desktopSidebarToggle"
              className="icon-button"
              type="button"
              data-label="Collapse sidebar"
              aria-controls="sidebar"
              aria-expanded="true"
            >
              <span data-icon="sidebar">
                <Icon name="sidebar" />
              </span>
            </Button>
            <Button
              variant="ghost"
              id="sidebarToggle"
              className="icon-button"
              type="button"
              data-label="Open navigation"
              aria-expanded="false"
            >
              <span data-icon="sidebar">
                <Icon name="sidebar" />
              </span>
            </Button>
            <Breadcrumb className="breadcrumb">
              <span data-icon="folder">
                <Icon name="folder" />
              </span>
              <Button
                variant="ghost"
                id="breadcrumbProject"
                type="button"
                className="subtle"
              ></Button>
              <span className="breadcrumb-separator">/</span>
              <h1 id="title" data-t="New session"></h1>
            </Breadcrumb>
            <span id="sourceBadge" className="source-badge" hidden></span>
            <Button
              variant="ghost"
              id="capabilityIssue"
              className="icon-button issue-indicator"
              type="button"
              data-label="Some integrations are unavailable"
              aria-haspopup="menu"
              hidden
            >
              <span data-icon="warning">
                <Icon name="warning" />
              </span>
            </Button>
            <span className="execution-identity">
              <span data-icon="codex"></span>
              <span id="executionAgentName" data-t="Codex"></span>
            </span>
            <span id="state" className="status-pill" role="status"></span>
            <a
              id="openCodex"
              className="icon-button open-codex"
              data-label="Open in Codex app"
              hidden
            >
              <span data-icon="external">
                <Icon name="external" />
              </span>
            </a>
            <Button
              variant="ghost"
              id="sessionInfo"
              className="icon-button"
              type="button"
              data-label="Session information"
            >
              <Icon name="settings" />
            </Button>
            <Button
              variant="ghost"
              id="filesToggle"
              className="icon-button"
              type="button"
              data-label="Project files"
            >
              <span data-icon="folder">
                <Icon name="folder" />
              </span>
            </Button>
            <Button
              variant="ghost"
              id="changesToggle"
              className="top-button"
              type="button"
              aria-expanded="false"
            >
              <span data-icon="diff">
                <Icon name="diff" />
              </span>
              <span data-t="Changes"></span>
              <span id="changeCount" className="count">
                0
              </span>
            </Button>
          </header>
          <Alert
            id="deviceOffline"
            className="device-offline"
            role="status"
            hidden
          >
            <div>
              <strong data-t="Your computer is offline"></strong>
              <p data-t="Keep agentTools open and remote connection enabled. This browser will reconnect automatically."></p>
            </div>
            <Button
              variant="ghost"
              id="retryDevice"
              type="button"
              data-t="Retry connection"
            ></Button>
          </Alert>
          <Alert id="ownerBanner" className="owner-banner" hidden>
            <div id="ownerNotice" className="owner-notice" role="status"></div>
            <Button
              variant="ghost"
              id="connectOwner"
              type="button"
              data-t="Connect in Codex"
              hidden
            ></Button>
          </Alert>
          <div
            id="conversationScroll"
            className="conversation-scroll"
            tabIndex="0"
            data-label="Conversation"
          >
            <Empty id="welcome" className="welcome">
              <EmptyMedia className="welcome-mark" data-icon="codex" />
              <h2 data-t="What can we build?"></h2>
              <p
                id="welcomeDescription"
                data-t="Choose a project to start, or pick up a conversation from your history."
              ></p>
              <Button
                variant="ghost"
                id="startChat"
                className="subtle"
                type="button"
              >
                <span data-icon="plus">
                  <Icon name="plus" />
                </span>
                <span data-t="New session"></span>
              </Button>
            </Empty>
            <div className="conversation-content">
              <p id="cwd" className="cwd"></p>
              <div
                id="conversationNavigator"
                className="conversation-navigator"
                hidden
              >
                <Input
                  id="conversationSearch"
                  type="search"
                  data-label="Search this conversation"
                  data-placeholder="Search loaded messages"
                  autoComplete="off"
                  maxLength={1024}
                />
                <select id="conversationSearchScope" data-label="Search scope">
                  <option value="loaded" data-t="Loaded history"></option>
                  <option
                    id="conversationFullHistory"
                    value="full"
                    data-t="Full history"
                    disabled
                  ></option>
                </select>
                <select
                  id="conversationFilter"
                  data-label="Filter loaded records"
                >
                  <option value="all" data-t="All records"></option>
                  <option value="failed" data-t="Failed"></option>
                  <option value="changes" data-t="Changes"></option>
                  <option value="artifacts" data-t="Artifacts"></option>
                  <option
                    value="interactions"
                    data-t="Interaction history"
                  ></option>
                </select>
                <select id="conversationTurn" data-label="Turn"></select>
                <div id="conversationIndexStatus" aria-live="polite"></div>
                <div id="conversationSearchResults" aria-live="polite"></div>
              </div>
              <Button
                variant="ghost"
                id="older"
                className="subtle"
                type="button"
                data-t="Load older conversation"
                hidden
              ></Button>
              <p
                id="readingRestore"
                className="note"
                role="status"
                data-t="Saved position is in older history. Load older messages to restore it."
                hidden
              ></p>
              <div id="history"></div>
              <div id="live"></div>
              <div id="working" className="working" hidden />
              <div id="planProgress" hidden></div>
              <DecisionSurface id="planAction" className="plan-action" hidden>
                <div>
                  <span data-icon="plan">
                    <Icon name="plan" />
                  </span>
                  <strong data-t="Execute this plan?"></strong>
                  <p data-t="Execute the plan, or add feedback to refine it."></p>
                </div>
                <div className="plan-actions">
                  <Button
                    variant="ghost"
                    id="continuePlanning"
                    type="button"
                    data-t="Continue planning"
                  ></Button>
                  <Button
                    variant="ghost"
                    id="executePlan"
                    className="primary"
                    type="button"
                    data-t="Execute plan"
                  ></Button>
                </div>
              </DecisionSurface>
              <p
                id="cut"
                className="note"
                data-t="Some output is truncated. Full history stays on your computer."
                hidden
              ></p>
            </div>
          </div>
          <div className="composer-dock">
            <Button
              variant="ghost"
              id="latest"
              className="latest-button"
              type="button"
              hidden
            >
              <span data-icon="down">
                <Icon name="down" />
              </span>
              <span data-t="Latest output"></span>
            </Button>
            <div id="contextBar" className="context-bar" hidden>
              <span id="contextCompaction" role="status" hidden></span>
            </div>
            <Button
              variant="ghost"
              id="pendingRequest"
              className="pending-request"
              type="button"
              hidden
            >
              <span data-icon="question">
                <Icon name="question" />
              </span>
              <span data-t="Codex is waiting for you"></span>
            </Button>
            <section
              id="queuePanel"
              className="message-queue"
              aria-labelledby="queueTitle"
              hidden
            >
              <div className="queue-heading">
                <span data-icon="clock">
                  <Icon name="clock" />
                </span>
                <span id="queueTitle" data-t="Queued messages"></span>
                <span id="queueCount"></span>
                <Button
                  variant="ghost"
                  id="resumeQueue"
                  type="button"
                  data-t="Resume queue"
                  hidden
                ></Button>
              </div>
              <p
                id="queueError"
                className="queue-error"
                role="status"
                hidden
              ></p>
              <p
                id="queueRequestHint"
                className="queue-request-hint"
                data-t="The current approval or question still needs your answer. Queued messages will wait."
                hidden
              ></p>
              <div id="queueList"></div>
            </section>
            <form id="composer" hidden>
              <div id="subagentsBar" className="subagents-bar" hidden>
                <Button
                  variant="ghost"
                  id="subagentsToggle"
                  className="subagents-chip"
                  type="button"
                  aria-haspopup="dialog"
                  aria-controls="subagentsDialog"
                >
                  <Icon name="agent" />
                  <span data-t="Agents"></span>
                  <span id="subagentsCount"></span>
                  <Icon name="chevron" />
                </Button>
              </div>
              <ComposerSurface>
                <div id="attachments" className="attachment-list" />
                <div className="composer-line">
                  <Label
                    htmlFor="message"
                    className="sr-only"
                    data-t="Message Codex"
                  />
                  <Textarea
                    id="message"
                    role="combobox"
                    aria-autoComplete="list"
                    aria-controls="suggestions"
                    aria-expanded="false"
                    rows="1"
                    maxLength="64000"
                    data-placeholder="Ask Codex to do anything. @ for files, / for tools."
                    spellCheck="false"
                  />
                </div>
                <div className="composer-controls">
                  <Button
                    variant="ghost"
                    id="attach"
                    className="icon-button"
                    type="button"
                    data-label="Add attachments"
                  >
                    <span data-icon="plus">
                      <Icon name="plus" />
                    </span>
                  </Button>
                  <ComposerFooter className="composer-toolbar">
                    <div className="composer-left">
                      <Button
                        variant="ghost"
                        id="permission"
                        className="composer-chip"
                        type="button"
                        aria-haspopup="menu"
                      >
                        <span data-icon="shield">
                          <Icon name="shield" />
                        </span>
                        <span data-t="Workspace access"></span>
                      </Button>
                      <Button
                        variant="ghost"
                        id="mode"
                        className="composer-chip"
                        type="button"
                        aria-haspopup="menu"
                      >
                        <span data-icon="plan">
                          <Icon name="plan" />
                        </span>
                        <span data-t="Default mode"></span>
                      </Button>
                    </div>
                    <ComposerFooterEnd className="composer-right">
                      <Button
                        variant="ghost"
                        id="model"
                        className="composer-chip"
                        type="button"
                        aria-haspopup="dialog"
                        aria-controls="reasoningCard"
                        aria-expanded="false"
                      >
                        <span data-t="Configured model"></span>
                        <span data-icon="chevron">
                          <Icon name="chevron" />
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        id="effort"
                        className="composer-chip"
                        type="button"
                        aria-haspopup="dialog"
                        aria-controls="reasoningCard"
                        aria-expanded="false"
                      >
                        <span data-t="Default effort"></span>
                        <span data-icon="chevron">
                          <Icon name="chevron" />
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        id="contextUsage"
                        className="context-usage icon-button"
                        type="button"
                        data-label="Context usage"
                        aria-haspopup="dialog"
                        aria-controls="contextUsageDialog"
                        hidden
                      >
                        <svg
                          className="context-ring"
                          viewBox="0 0 32 32"
                          aria-hidden="true"
                        >
                          <circle
                            className="context-ring-track"
                            cx="16"
                            cy="16"
                            r="12"
                            pathLength="100"
                          ></circle>
                          <circle
                            id="contextUsageRing"
                            cx="16"
                            cy="16"
                            r="12"
                            pathLength="100"
                            strokeDasharray="0 100"
                          ></circle>
                        </svg>
                        <span id="contextUsageText" className="sr-only"></span>
                      </Button>
                    </ComposerFooterEnd>
                  </ComposerFooter>
                  <Button
                    variant="ghost"
                    id="stop"
                    className="stop-button"
                    type="button"
                    data-label="Stop turn"
                    hidden
                  >
                    <span data-icon="stop">
                      <Icon name="stop" />
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    type="submit"
                    id="send"
                    className="send-button"
                    data-label="Send"
                  >
                    <span data-icon="up">
                      <Icon name="up" />
                    </span>
                  </Button>
                </div>
              </ComposerSurface>
              <div
                id="suggestions"
                className="suggestions bg-popover"
                role="listbox"
                hidden
              />
              <input id="fileInput" type="file" multiple hidden />
            </form>
            <div className="composer-caption">
              <span
                id="composerHint"
                data-t="Codex runs on your computer. Review its changes."
              ></span>
              <span
                id="keyHint"
                data-t="Enter to send · Shift + Enter for a new line"
              ></span>
            </div>
          </div>
        </section>
        <Panel
          id="changesPanel"
          title="Project files"
          className="changes-panel"
          hidden
          bar={
            <div className="panel-tabs" role="tablist">
              <Button
                variant="ghost"
                id="changesTab"
                type="button"
                role="tab"
                aria-selected="true"
                aria-controls="changesContent"
                data-t="Changes"
              ></Button>
              <Button
                variant="ghost"
                id="filesTab"
                type="button"
                role="tab"
                aria-selected="false"
                aria-controls="filesContent"
                data-t="Files"
              ></Button>
              <Button
                variant="ghost"
                id="artifactsTab"
                type="button"
                role="tab"
                aria-selected="false"
                aria-controls="artifactsContent"
              >
                <span data-t="Artifacts"></span>{" "}
                <span id="artifactCount"></span>
              </Button>
            </div>
          }
          actions={
            <Button
              variant="ghost"
              id="closeChanges"
              className="icon-button"
              type="button"
              data-label="Close changes"
            >
              <span data-icon="close">
                <Icon name="close" />
              </span>
            </Button>
          }
        >
          <div
            id="changesResize"
            role="separator"
            tabIndex="0"
            aria-orientation="vertical"
            aria-controls="changesPanel"
            aria-valuemin="280"
            aria-valuemax="720"
            aria-valuenow="400"
            aria-describedby="sidebarResizeHint"
            data-label="Resize right panel"
          ></div>
          <div
            id="changesWarning"
            className="panel-warning"
            role="status"
            hidden
          ></div>
          <div id="changesContent" role="tabpanel"></div>
          <div id="artifactsContent" role="tabpanel" hidden></div>
          <div id="filesContent" role="tabpanel" hidden>
            <SearchField className="file-search">
              <span data-icon="search">
                <Icon name="search" />
              </span>
              <Input
                id="filesSearch"
                type="search"
                data-label="Find a file"
                data-placeholder="Find a file"
                autoComplete="off"
              />
            </SearchField>
            <div id="fileList"></div>
          </div>
          <section id="filePreview" hidden>
            <div className="file-preview-heading">
              <Button
                variant="ghost"
                id="closeFilePreview"
                className="icon-button"
                type="button"
                data-label="Back to files"
              >
                <span data-icon="back">
                  <Icon name="back" />
                </span>
              </Button>
              <strong id="filePreviewName"></strong>
              <a
                id="filePreviewDownload"
                className="icon-button"
                data-label="Download file"
              >
                <span data-icon="download">
                  <Icon name="download" />
                </span>
              </a>
            </div>
            <p id="filePreviewMeta" className="note"></p>
            <div id="filePreviewContent" tabIndex="0"></div>
          </section>
        </Panel>
      </main>
    </>
  );
}
