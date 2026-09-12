# Review notes, privacy answers, and the rejection risk

## The one real risk: Apple guideline 4.2 ("minimum functionality")

This app displays the live emmerdaleagriculture.com site inside a native
shell. That is a legitimate, common architecture, but it is also exactly the
shape Apple rejects when an app is *only* a repackaged website with nothing
native about it. Expect this to be the thing that decides the review.

Three things already work in the app's favour, without extra engineering:

1. **Photo upload uses the native camera.** The job-posting flow at `/start`
   uses a plain file input. Inside a Capacitor WebView that automatically
   triggers the iOS camera and photo picker — a real native capability, not a
   web upload dialog. Worth demonstrating in the review video if asked.
2. **A dedicated app entry screen.** The app does not open on the marketing
   homepage. It boots to `/app`, a screen that exists only for the app, with
   the marketing removed and the two real actions promoted. Signed-in users
   skip it entirely and land on their dashboard.
3. **Proper native presentation** — real app icon, splash screen, standalone
   window, no browser chrome.

**If it is rejected anyway**, the strongest single fix is push notifications
(see the handoff document — it is scoped but not built). That is a capability
a website genuinely cannot offer, which is the crux of what 4.2 is testing.
Contractors deciding whether to bid on a job that closes in 24 hours are
exactly the audience that justifies it, so it is worth building on its merits
regardless.

---

## App Review notes (paste into App Store Connect > App Review Information)

```
Emmerdale Agriculture is a managed marketplace for rural land services
(paddock maintenance, topping, harrowing, hedge cutting, fencing) operating
across England, Wales and Scotland. It is operated by Emmerdale Agriculture
Online Ltd, the company behind Hampshire Paddock Management.

HOW TO REVIEW WITHOUT AN ACCOUNT
Most of the app needs no account. On launch you reach the app's own entry
screen, then "Book online" opens the job-posting flow. You can complete that
flow and submit a job without registering — an account is only offered
afterwards, to let a customer come back to the job later.

The photo step in the job flow uses the device camera and photo library to let
a customer show the land or the problem they need dealt with. This is the main
native capability in the app.

DEMO ACCOUNT
[Add a demo account here if you want reviewers to see the contractor side:
the job board and bidding flow are behind a contractor login, and reviewers
cannot self-approve as a contractor.]
Username: [ ]
Password: [ ]

CONTENT AND PAYMENTS
All work is carried out by approved contractors in the physical world.
Payments in the app are for real-world services performed off-app, so they use
standard payment processing rather than in-app purchase, per guideline 3.1.3(e).
No digital goods or subscriptions are sold to consumers in this app.
```

> The bracketed demo-account section matters. Without it, reviewers cannot see
> the contractor side at all, and "we couldn't access the full app" is a
> common, avoidable rejection. Create a real contractor account, approve it,
> and put the credentials there.

---

## Apple privacy questionnaire (App Store Connect > App Privacy)

Answer against what the site actually collects. Based on the codebase:

| Data type | Collected? | Linked to identity? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Name | Yes | Yes | No | App functionality |
| Email address | Yes | Yes | No | App functionality |
| Phone number | Yes | Yes | No | App functionality |
| Physical address / postcode | Yes | Yes | No | App functionality (matching jobs to counties) |
| Photos | Yes | Yes | No | App functionality (job photos) |
| User content (job descriptions) | Yes | Yes | No | App functionality |
| Product interaction / analytics | Yes | No | No | Analytics |
| Payment info | No | — | — | Handled by the payment processor, never stored by the app |
| Location (precise/coarse GPS) | No | — | — | Postcodes are typed, not read from the device |
| Contacts, health, financial info, browsing history | No | — | — | — |

**Tracking: answer No.** The site runs Google Analytics and a Meta pixel, but
neither is used to track users across other companies' apps and websites for
advertising in the App Tracking Transparency sense. If marketing later starts
using the Meta pixel for cross-app ad targeting, this answer must change and
an ATT prompt becomes mandatory — flag it to whoever owns marketing before
launch, and confirm rather than assume.

---

## Google Play Data Safety form

Google asks the same ground in a different shape. Mirror the table above, and:

- **Is all data encrypted in transit?** Yes (HTTPS throughout, Supabase + Vercel).
- **Can users request deletion?** You must be able to answer yes and provide a
  route. The privacy policy at `/privacy` should state how someone requests
  account/data deletion, and Google now requires a deletion request URL.
  **Check `/privacy` covers this before submitting** — if it does not, that is
  a policy rejection, and it is a content fix rather than an engineering one.
- **Data collected vs shared:** collected, not shared with third parties for
  their own purposes. Analytics providers are processors, not recipients.

---

## Permissions the app will ask for

Only camera and photo library, and only at the moment someone attaches a photo
to a job. Both need usage strings in `ios/App/App/Info.plist` or iOS will
crash the app the first time the picker opens — Capacitor usually adds these,
but confirm they exist and read sensibly:

```xml
<key>NSCameraUsageDescription</key>
<string>Take a photo of the land or work you need doing, so contractors can price it accurately.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Attach a photo of the land or work you need doing, so contractors can price it accurately.</string>
```

Vague strings ("this app needs camera access") are themselves a rejection
reason. These say what the photo is for.
