import React, { useState } from "react";
import JSZip from "jszip";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line 
} from "recharts";
import { 
  Upload, MessageSquare, Star, 
  TrendingUp, CheckCircle2,
  Loader2, Search, BarChart3,
  Copy, Sparkles, Send
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "./lib/utils";
import { Review, AnalysisResult } from "./types";
import { analyzeReviews, generateReply } from "./services/gemini";

export default function App() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [debugFiles, setDebugFiles] = useState<string[]>([]);
  
  const [generatingReplyId, setGeneratingReplyId] = useState<string | null>(null);
  const [generatedReplies, setGeneratedReplies] = useState<Record<string, string>>({});

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setReviews([]);
    setAnalysis(null);
    setDebugFiles([]);
    
    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      const allReviews: Review[] = [];
      const filePaths = Object.keys(contents.files);
      setDebugFiles(filePaths);

      console.log("Files in ZIP:", filePaths);

      const jsonFiles = Object.entries(contents.files).filter(([path]) => 
        path.endsWith(".json") && !path.includes("__MACOSX")
      );

      const csvFiles = Object.entries(contents.files).filter(([path]) => 
        path.endsWith(".csv") && !path.includes("__MACOSX")
      );

      // 1. Process JSON Files
      for (const [path, zipEntry] of jsonFiles) {
        const content = await zipEntry.async("string");
        try {
          const data = JSON.parse(content);
          const items = Array.isArray(data) ? data : (data.reviews || [data]);
          
          items.forEach((item: any) => {
            const rating = item.starRating ?? item.rating ?? item.score ?? item.punteggio;
            const comment = item.comment ?? item.text ?? item.review ?? item.content ?? item.commento;
            const name = item.reviewerName ?? item.authorName ?? item.author ?? item.displayName ?? item.nome;
            
            if (rating !== undefined && (comment !== undefined || name !== undefined)) {
              allReviews.push({
                reviewId: String(item.reviewId || item.id || Math.random().toString(36).substr(2, 9)),
                reviewerName: String(name || "Anonimo"),
                starRating: Number(rating) || 0,
                comment: String(comment || ""),
                createTime: item.createTime || item.publishTime || item.time || item.date || new Date().toISOString(),
                replyComment: item.replyComment || item.reply?.text || item.response || item.risposta,
              });
            }
          });
        } catch (e) {
          console.warn("Could not parse JSON file:", path, e);
        }
      }

      // 2. Process CSV Files (Fallback)
      if (allReviews.length === 0) {
        for (const [path, zipEntry] of csvFiles) {
          const content = await zipEntry.async("string");
          const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
          if (lines.length > 1) {
            const headers = lines[0].toLowerCase().split(/[;,]/);
            const ratingIdx = headers.findIndex(h => h.includes('rating') || h.includes('star') || h.includes('punteggio') || h.includes('stelle'));
            const commentIdx = headers.findIndex(h => h.includes('comment') || h.includes('text') || h.includes('recensione') || h.includes('testo'));
            const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('author') || h.includes('nome') || h.includes('autore'));
            const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('time') || h.includes('data'));

            if (ratingIdx !== -1) {
              for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(/[;,]/);
                if (cols.length > ratingIdx) {
                  allReviews.push({
                    reviewId: Math.random().toString(36).substr(2, 9),
                    reviewerName: nameIdx !== -1 ? cols[nameIdx]?.replace(/"/g, '') : "Anonimo",
                    starRating: parseInt(cols[ratingIdx]) || 0,
                    comment: commentIdx !== -1 ? cols[commentIdx]?.replace(/"/g, '') : "",
                    createTime: dateIdx !== -1 ? cols[dateIdx] : new Date().toISOString(),
                  });
                }
              }
            }
          }
        }
      }

      if (allReviews.length === 0) {
        // Final attempt: check if there's a nested ZIP
        const nestedZips = Object.entries(contents.files).filter(([path]) => 
          path.endsWith(".zip") && !path.includes("__MACOSX")
        );
        if (nestedZips.length > 0) {
          alert("Trovato un file ZIP nidificato. Prova ad estrarre prima lo ZIP principale e caricare lo ZIP specifico del 'Profilo dell'attività'.");
        }
      } else {
        const sorted = allReviews.sort((a, b) => {
          try {
            return new Date(b.createTime).getTime() - new Date(a.createTime).getTime();
          } catch(e) { return 0; }
        });
        setReviews(sorted);
        performAnalysis(sorted);
      }
    } catch (error: any) {
      console.error("Error processing ZIP:", error);
      alert(`Errore: ${error.message || "File non valido"}`);
    } finally {
      setLoading(false);
    }
  };

  const performAnalysis = async (data: Review[]) => {
    setAnalyzing(true);
    try {
      const result = await analyzeReviews(data);
      setAnalysis(result);
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleGenerateReply = async (review: Review) => {
    setGeneratingReplyId(review.reviewId);
    try {
      const reply = await generateReply(review);
      setGeneratedReplies(prev => ({ ...prev, [review.reviewId]: reply }));
    } catch (error) {
      console.error("Failed to generate reply:", error);
      alert("Errore nella generazione della risposta.");
    } finally {
      setGeneratingReplyId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Risposta copiata negli appunti!");
  };

  const filteredReviews = reviews.filter(r => {
    const matchesSearch = r.comment.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          r.reviewerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRating = ratingFilter === null || r.starRating === ratingFilter;
    return matchesSearch && matchesRating;
  });

  const ratingCounts = [5, 4, 3, 2, 1].map(rating => ({
    rating: `${rating} ★`,
    count: reviews.filter(r => r.starRating === rating).length
  }));

  const timeData = reviews.reduce((acc: any[], review) => {
    try {
      const date = format(parseISO(review.createTime), "MMM yyyy", { locale: it });
      const existing = acc.find(item => item.date === date);
      if (existing) {
        existing.count += 1;
        existing.avgRating = (existing.avgRating * (existing.count - 1) + review.starRating) / existing.count;
      } else {
        acc.push({ date, count: 1, avgRating: review.starRating });
      }
    } catch (e) {
      // Ignore invalid dates
    }
    return acc;
  }, []).reverse().slice(-12);

  if (reviews.length === 0) {
    return (
      <div className="min-h-screen bg-[#fafafa] flex flex-col items-center justify-center p-6 font-sans text-[#1a1a1a]">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 mb-4">
              <BarChart3 size={32} />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">Google Review Insight</h1>
            <p className="text-gray-500">
              Analizza i feedback dei tuoi clienti in pochi secondi. Carica il file ZIP generato da Google Takeout.
            </p>
          </div>

          <div className="relative group">
            <input
              type="file"
              accept=".zip"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              disabled={loading}
            />
            <div className={cn(
              "border-2 border-dashed border-gray-200 rounded-3xl p-12 transition-all duration-300 group-hover:border-blue-400 group-hover:bg-blue-50/30",
              loading && "opacity-50 cursor-not-allowed"
            )}>
              {loading ? (
                <div className="flex flex-col items-center space-y-4">
                  <Loader2 className="animate-spin text-blue-600" size={32} />
                  <p className="font-medium text-blue-600">Elaborazione in corso...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:text-blue-500 group-hover:bg-blue-100 transition-colors">
                    <Upload size={24} />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">Trascina il file ZIP qui</p>
                    <p className="text-sm text-gray-400">o clicca per selezionarlo dal computer</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-8 border-t border-gray-100">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-4">Come ottenere il file?</p>
            <ol className="text-left text-sm text-gray-500 space-y-2 list-decimal list-inside">
              <li>Vai su <a href="https://takeout.google.com" target="_blank" className="text-blue-600 hover:underline">Google Takeout</a></li>
              <li>Seleziona solo "Profilo dell'attività"</li>
              <li>Crea l'esportazione e scarica il file ZIP</li>
              <li>Caricalo qui sopra</li>
            </ol>
          </div>

          {debugFiles.length > 0 && reviews.length === 0 && (
            <div className="mt-8 p-4 bg-gray-100 rounded-xl text-left">
              <p className="text-xs font-bold text-gray-500 mb-2 uppercase">Struttura file rilevata:</p>
              <div className="max-h-40 overflow-y-auto text-[10px] font-mono text-gray-600 space-y-1">
                {debugFiles.slice(0, 50).map((f, i) => (
                  <div key={i} className="truncate">{f}</div>
                ))}
                {debugFiles.length > 50 && <div>... e altri {debugFiles.length - 50} file</div>}
              </div>
              <p className="mt-4 text-xs text-red-500">
                Non abbiamo trovato recensioni in questi file. Assicurati che lo ZIP contenga i file JSON o CSV delle recensioni.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans text-[#1a1a1a]">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
            <BarChart3 size={20} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Review Insight Pro</h1>
        </div>
        <button 
          onClick={() => { setReviews([]); setAnalysis(null); }}
          className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
        >
          Carica un altro file
        </button>
      </header>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <MessageSquare size={20} />
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase">Totale</span>
            </div>
            <div className="text-3xl font-bold">{reviews.length}</div>
            <div className="text-sm text-gray-400 mt-1">Recensioni analizzate</div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-yellow-50 text-yellow-600 rounded-lg">
                <Star size={20} />
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase">Media</span>
            </div>
            <div className="text-3xl font-bold">
              {(reviews.reduce((a, b) => a + b.starRating, 0) / reviews.length).toFixed(1)}
            </div>
            <div className="flex items-center mt-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star 
                  key={s} 
                  size={12} 
                  className={cn(
                    "fill-current", 
                    s <= Math.round(reviews.reduce((a, b) => a + b.starRating, 0) / reviews.length) ? "text-yellow-400" : "text-gray-200"
                  )} 
                />
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                <TrendingUp size={20} />
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase">Trend</span>
            </div>
            <div className="text-3xl font-bold">
              {timeData[timeData.length - 1]?.count || 0}
            </div>
            <div className="text-sm text-gray-400 mt-1">Recensioni nell'ultimo mese</div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                <CheckCircle2 size={20} />
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase">Sentiment</span>
            </div>
            <div className="text-3xl font-bold capitalize">
              {analysis?.sentiment || "..."}
            </div>
            <div className="text-sm text-gray-400 mt-1">Analisi AI</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center">
                  <TrendingUp className="mr-2 text-blue-600" size={24} />
                  Analisi Strategica AI
                </h2>
                {analyzing && <Loader2 className="animate-spin text-blue-600" size={20} />}
              </div>
              <div className="p-8">
                {!analysis ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <Loader2 className="animate-spin mb-4" size={32} />
                    <p>Generazione insight in corso...</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <section>
                      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Riepilogo</h3>
                      <p className="text-lg leading-relaxed text-gray-700">{analysis.summary}</p>
                    </section>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <section>
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Temi Ricorrenti</h3>
                        <ul className="space-y-3">
                          {analysis.themes.map((theme, i) => (
                            <li key={i} className="flex items-start">
                              <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-600 mr-3 shrink-0" />
                              <span className="text-gray-700">{theme}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                      
                      <section>
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Suggerimenti</h3>
                        <ul className="space-y-3">
                          {analysis.suggestions.map((sug, i) => (
                            <li key={i} className="flex items-start">
                              <CheckCircle2 className="mt-0.5 text-green-500 mr-3 shrink-0" size={16} />
                              <span className="text-gray-700">{sug}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold mb-6">Distribuzione Rating</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ratingCounts} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                      <XAxis type="number" hide />
                      <YAxis dataKey="rating" type="category" width={40} axisLine={false} tickLine={false} />
                      <Tooltip 
                        cursor={{fill: '#f8f9fa'}} 
                        contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}}
                      />
                      <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold mb-6">Trend Recensioni</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timeData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                      <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
                      <Tooltip 
                        contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}}
                      />
                      <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={3} dot={{r: 4, fill: '#3b82f6'}} activeDot={{r: 6}} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col h-[800px]">
            <div className="p-6 border-b border-gray-50 space-y-4">
              <h2 className="text-xl font-bold">Recensioni</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Cerca nei commenti..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {[5, 4, 3, 2, 1].map(rating => (
                  <button
                    key={rating}
                    onClick={() => setRatingFilter(ratingFilter === rating ? null : rating)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                      ratingFilter === rating 
                        ? "bg-blue-600 border-blue-600 text-white" 
                        : "bg-white border-gray-200 text-gray-500 hover:border-blue-400"
                    )}
                  >
                    {rating} ★
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {filteredReviews.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                  <Search size={32} className="mb-2 opacity-20" />
                  <p>Nessuna recensione trovata</p>
                </div>
              ) : (
                filteredReviews.map((review) => (
                  <div key={review.reviewId} className="p-4 hover:bg-gray-50 rounded-2xl transition-colors group">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-bold text-sm">{review.reviewerName}</div>
                      <div className="text-[10px] text-gray-400">
                        {format(parseISO(review.createTime), "dd MMM yyyy", { locale: it })}
                      </div>
                    </div>
                    <div className="flex mb-2">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star 
                          key={s} 
                          size={10} 
                          className={cn(
                            "fill-current", 
                            s <= review.starRating ? "text-yellow-400" : "text-gray-200"
                          )} 
                        />
                      ))}
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-3 group-hover:line-clamp-none transition-all">
                      {review.comment || <span className="italic text-gray-300">Nessun commento</span>}
                    </p>

                    {/* Reply Generation UI */}
                    <div className="mt-4 pt-4 border-t border-gray-50">
                      {generatedReplies[review.reviewId] ? (
                        <div className="bg-blue-50/50 p-3 rounded-xl space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-blue-600 uppercase">Bozza Suggerita</span>
                            <button 
                              onClick={() => copyToClipboard(generatedReplies[review.reviewId])}
                              className="p-1 hover:bg-blue-100 rounded-md text-blue-600 transition-colors"
                              title="Copia risposta"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                          <p className="text-xs text-gray-700 leading-relaxed">
                            {generatedReplies[review.reviewId]}
                          </p>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleGenerateReply(review)}
                          disabled={generatingReplyId === review.reviewId}
                          className="flex items-center space-x-2 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50"
                        >
                          {generatingReplyId === review.reviewId ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Sparkles size={14} />
                          )}
                          <span>{generatingReplyId === review.reviewId ? "Generazione..." : "Suggerisci risposta AI"}</span>
                        </button>
                      )}
                    </div>

                    {review.replyComment && (
                      <div className="mt-3 pl-3 border-l-2 border-gray-100">
                        <p className="text-[11px] font-bold text-gray-400 uppercase mb-1">Tua Risposta</p>
                        <p className="text-xs text-gray-500 italic">{review.replyComment}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto p-8 text-center text-gray-400 text-xs">
        &copy; 2026 Google Review Insight Pro • Analisi alimentata da Google Gemini
      </footer>
    </div>
  );
}
