"use client";

import { useEffect, useState } from "react";
import { useEnvSetup } from "@/hooks/use-env-setup";
import { SetupBanner } from "./setup-banner";
import { WelcomeWizard } from "./welcome-wizard";

const DISMISSED_KEY = "tongflow.onboarding.v1.dismissed";

/**
 * Single mount point for first-run onboarding. Waits for the setup status
 * fetch before deciding (a returning user on a fresh browser whose Modal is
 * already connected must never see the wizard), then shows the one-shot
 * welcome wizard and/or the persistent setup banner until Modal is connected.
 */
export function OnboardingGate() {
    const { modalConnected, modalRelevant } = useEnvSetup();
    const [wizardOpen, setWizardOpen] = useState(false);
    const [decided, setDecided] = useState(false);

    useEffect(() => {
        if (decided || modalConnected === null) return;
        if (modalRelevant && !modalConnected) {
            let dismissed = false;
            try {
                dismissed = localStorage.getItem(DISMISSED_KEY) === "1";
            } catch {
                // Storage unavailable (private mode): treat as not dismissed.
            }
            if (!dismissed) setWizardOpen(true);
        }
        setDecided(true);
    }, [decided, modalConnected, modalRelevant]);

    const dismissWizard = () => {
        setWizardOpen(false);
        try {
            localStorage.setItem(DISMISSED_KEY, "1");
        } catch {
            // Best effort; worst case the wizard shows again next visit.
        }
    };

    const showBanner = modalRelevant && modalConnected === false && !wizardOpen;

    return (
        <>
            <WelcomeWizard open={wizardOpen} onClose={dismissWizard} />
            {showBanner ? <SetupBanner /> : null}
        </>
    );
}
