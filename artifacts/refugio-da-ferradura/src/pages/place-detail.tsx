import React from "react";
import { useRoute, Redirect } from "wouter";
export default function PlaceDetail() {
  const [, params] = useRoute("/lugares/:slug");
  return <Redirect to={`/blog/${params?.slug || ""}`} />;
}
