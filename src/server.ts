import { env } from "./config.js";
import { app } from "./app.js";

app.listen(env.PORT, () => console.log("kioscoqr listening on :" + env.PORT));
