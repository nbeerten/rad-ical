import type { FC, PropsWithChildren } from "hono/jsx";

export const Layout: FC<PropsWithChildren<{ title: string }>> = ({
    title,
    children,
}) => (
    <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta
                name="viewport"
                content="width=device-width, initial-scale=1.0"
            />
            <link rel="preconnect" href="https://rsms.me/" />
            <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
            <link rel="stylesheet" href="/styles.css" />
            <title>{title}</title>
        </head>
        <body>{children}</body>
    </html>
);

export const ConfirmPrompt: FC<{
    isCancelled: boolean;
    rawTitle?: string;
    titleText: string;
}> = ({ isCancelled, rawTitle, titleText }) => (
    <Layout title={`${isCancelled ? "Restore" : "Cancel"} Event`}>
        <div class="card">
            <h1 class="text-dark">
                {isCancelled ? "Restore" : "Cancel"} Event
            </h1>
            {rawTitle && <div class="subtitle">{titleText}</div>}
            <p class="mb-6">
                {isCancelled
                    ? "This event is currently removed from your calendar. Do you want to restore it?"
                    : "Are you sure you want to remove this event from your calendar?"}
            </p>
            <form method="post">
                <input
                    type="hidden"
                    name="action"
                    value={isCancelled ? "restore" : "cancel"}
                />
                <button
                    type="submit"
                    class={`btn ${isCancelled ? "btn-restore" : ""}`}
                >
                    {isCancelled ? "Confirm Restore" : "Confirm Cancellation"}
                </button>
            </form>
        </div>
    </Layout>
);

export const ActionResult: FC<{
    actionTaken: string;
    rawTitle?: string;
    titleText: string;
}> = ({ actionTaken, rawTitle, titleText }) => {
    const isCancelled = actionTaken === "cancelled";
    return (
        <Layout title={`Event ${isCancelled ? "Cancelled" : "Restored"}`}>
            <div class="card">
                <div class="header">
                    <div>
                        <h1 class={isCancelled ? "text-green" : "text-blue"}>
                            Event {isCancelled ? "Cancelled" : "Restored"}
                        </h1>
                        {rawTitle && <div class="subtitle">{titleText}</div>}
                    </div>
                    <div class={`icon ${isCancelled ? "text-green" : "text-blue"}`}>
                        {isCancelled ? (
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={3}
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                                />
                            </svg>
                        ) : (
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth={3}
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"
                                />
                            </svg>
                        )}
                    </div>
                </div>
                
                
                <p class="mb-0">
                    The event has been successfully{" "}
                    {isCancelled ? "removed" : "restored"}. It will{" "}
                    {isCancelled ? "disappear from" : "reappear in"} your
                    calendar after the next synchronisation.
                </p>
                <form method="post" class="mt-6">
                    <input
                        type="hidden"
                        name="action"
                        value={isCancelled ? "restore" : "cancel"}
                    />
                    <button type="submit" class="btn btn-undo">
                        Undo {isCancelled ? "Cancellation" : "Restore"}
                    </button>
                </form>
            </div>
        </Layout>
    );
};
