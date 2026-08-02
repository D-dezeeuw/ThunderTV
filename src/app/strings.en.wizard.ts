/** Setup-wizard copy — its own overflow file; see `strings.en.epg.ts` for why these live outside `strings.en.ts`. `edit` re-labels the exact same modal when it opens as a configured source's editor (src/state/source-edit.ts). */
export const enWizard = {
    wizard: {
        title: 'Welcome to ThunderTV',
        skip: 'Skip for now',
        step1: {
            heading: 'Let’s get you set up',
            intro: 'Choose your language and preferred content country — both are switchable anytime in Settings.',
            next: 'Continue',
        },
        step2: {
            heading: 'Add your channels',
            intro: 'Enter your Xtream Codes account to import your channels now, or skip and add a source later from the Connect card.',
            back: 'Back',
        },
        edit: {
            title: 'Edit source',
            heading: 'Connection details',
            intro: 'Change the server or account for this source. Leave the password blank to keep the stored one. Saving reloads its channels.',
            cancel: 'Cancel',
        },
    },
};
