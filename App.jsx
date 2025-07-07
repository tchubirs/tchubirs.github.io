// Projeto React com integração automática via APIs (YouTube + Twitch + TikTok + Detecção ao vivo + SEO + Sobre)
import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const YOUTUBE_API_KEY = "AIzaSyCg_BvIRq_qYARTBwI8-q0nrhVRWDd4sHI";
const CHANNEL_ID = "UCVWeo7G9daOvWgwAqEcf5uw";
const MAX_RESULTS = 5;
const TWITCH_CHANNEL = "tchubi";
const TWITCH_PARENT = "tchubi.org";

export default function App() {
  const [videos, setVideos] = useState([]);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    fetch(
      `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&channelId=${CHANNEL_ID}&part=snippet,id&order=date&maxResults=${MAX_RESULTS}`
    )
      .then((res) => res.json())
      .then((data) => {
        const videoItems = data.items.filter((item) => item.id.videoId);
        setVideos(videoItems);
      });

    fetch(`https://api.twitch.tv/helix/streams?user_login=${TWITCH_CHANNEL}`, {
      headers: {
        "Client-ID": "",
        Authorization: "Bearer "
      }
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.data && data.data.length > 0) {
          setIsLive(true);
        }
      });
  }, []);

  return (
    <div className="bg-black text-white min-h-screen p-6">
      <header className="text-center mb-10">
        <img
          src="https://static-cdn.jtvnw.net/jtv_user_pictures/cdb36cfb-2a7e-4198-87b3-8b75a22ed176-profile_image-300x300.png"
          alt="Tchubi"
          className="mx-auto rounded-full w-32 border-4 border-purple-500"
        />
        <h1 className="text-4xl font-bold mt-4">Tchubi</h1>
        <p className="text-gray-400">Streamer de FPS e sobrevivência</p>
        <div className="mt-4 flex justify-center gap-4">
          <a href="https://twitch.tv/tchubi" target="_blank" className="bg-purple-600 px-4 py-2 rounded-md hover:bg-purple-700">Twitch</a>
          <a href="https://www.youtube.com/c/Tchubi" target="_blank" className="bg-red-600 px-4 py-2 rounded-md hover:bg-red-700">YouTube</a>
          <a href="https://www.tiktok.com/@tchubi.rs" target="_blank" className="bg-pink-500 px-4 py-2 rounded-md hover:bg-pink-600">TikTok</a>
        </div>
      </header>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Sobre Mim</h2>
        <p className="text-gray-300 max-w-3xl mx-auto text-center">
          Olá! Eu sou o Tchubi, criador de conteúdo focado em jogos de sobrevivência e FPS. Meu estilo é tryhard, sempre buscando o máximo em performance e entretenimento para minha comunidade. Acompanhe minhas lives, vídeos e clipes nas plataformas que você mais curte!
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Últimos vídeos no YouTube</h2>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {videos.map((video) => (
            <Card key={video.id.videoId} className="min-w-[300px]">
              <CardContent>
                <iframe
                  width="100%"
                  height="180"
                  src={`https://www.youtube.com/embed/${video.id.videoId}`}
                  allowFullScreen
                ></iframe>
                <p className="mt-2 text-sm font-medium">
                  {video.snippet.title}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">
          {isLive ? "AO VIVO AGORA NA TWITCH" : "Última live na Twitch"}
        </h2>
        <div className="flex justify-center">
          <iframe
            src={`https://player.twitch.tv/?channel=${TWITCH_CHANNEL}&parent=${TWITCH_PARENT}`}
            height="400"
            width="700"
            allowFullScreen
          ></iframe>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Clipes populares da Twitch</h2>
        <div className="flex justify-center">
          <iframe
            src={`https://clips.twitch.tv/embed?clip=AgilePunchyDadCopyThis&parent=${TWITCH_PARENT}`}
            width="640"
            height="360"
            allowFullScreen
          ></iframe>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Vídeos recentes do TikTok</h2>
        <div className="flex gap-4 overflow-x-auto pb-4">
          <iframe src="https://www.tiktok.com/embed/v2/7353600346588247298" width="300" height="500" allowFullScreen></iframe>
          <iframe src="https://www.tiktok.com/embed/v2/7350282434206559489" width="300" height="500" allowFullScreen></iframe>
          <iframe src="https://www.tiktok.com/embed/v2/7222026890532408582" width="300" height="500" allowFullScreen></iframe>
          <iframe src="https://www.tiktok.com/embed/v2/7219840088657698053" width="300" height="500" allowFullScreen></iframe>
          <iframe src="https://www.tiktok.com/embed/v2/7207193709266341126" width="300" height="500" allowFullScreen></iframe>
        </div>
      </section>

      <section className="mb-10 text-center">
        <h2 className="text-2xl font-semibold mb-2">Contato</h2>
        <p className="text-gray-400">Para parcerias, colaborações ou dúvidas, envie um e-mail para:</p>
        <p className="text-purple-400 font-medium">contato@tchubi.org</p>
      </section>

      <footer className="text-center text-gray-500 mt-16">
        © 2025 Tchubi. Todos os direitos reservados.
      </footer>
    </div>
  );
}
