FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish PicoExhibitorPortal.Web/PicoExhibitorPortal.Web.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
# Install fonts + GDI+ so PdfSharpCore can render PDFs on Linux
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgdiplus \
        fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/publish .
COPY seeds/ seeds/
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "PicoExhibitorPortal.Web.dll"]
