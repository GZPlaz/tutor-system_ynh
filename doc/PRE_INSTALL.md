**Moving from an existing My Webapp installation?**

Answer *"Import data from an existing My Webapp instance"* with the app id of your current site (for example `my_webapp__5`; see `yunohost app list`). Your database, uploaded files and email settings are **copied** into the new app. The old site is only read, never changed, so it keeps working while you test the new one.

Install the new app on a **different domain or path** first (for example `new.example.org`), check everything, then follow `MIGRATION.md` to cut over. Starting fresh? Leave that question empty.

Installing downloads and builds the app on your server; expect a few minutes and about 1 GB of free RAM while it builds.
