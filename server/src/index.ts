import 'dotenv/config';
import app from './app';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);

app.listen(port, () => {
  console.log(`SoundSage API listening on :${port}`);
});
